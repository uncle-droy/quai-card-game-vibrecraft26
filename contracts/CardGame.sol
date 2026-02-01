// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract CardGame {
    struct Card {
        uint attack;
    }
    
    struct Player {
        uint[] deck;
        uint team; // 1 or 2
        bool hasJoined;
    }

    // Config
    mapping(uint => Card) public cards;
    uint public constant MAX_HP = 100;
    uint256 public constant ENTRY_FEE = 0.0067 ether; 
    
    // State
    uint public gameId; 
    mapping(uint => mapping(address => Player)) public players; 
    
    // Tracking players for auto-payout
    mapping(uint => mapping(uint => address[])) public teamMembers; // gameId => teamId => addresses[]

    mapping(uint => uint) public teamHP;   
    mapping(uint => uint) public teamSize; 
    mapping(uint => uint) public teamCards; 

    // Betting
    mapping(uint => uint256) public gamePrizePool;      
    
    uint public currentTeamTurn; 
    bool public gameActive;
    uint public winnerTeam;

    event GameStarted(uint gameId);
    event PlayerJoined(uint gameId, address player, uint team);
    event CardPlayed(address player, uint team, uint cardId, uint damage);
    event GameEnded(uint winningTeam, uint256 totalPrize);
    event PayoutSent(address player, uint256 amount);

    constructor() {
        cards[0] = Card(5);
        cards[1] = Card(8);
        cards[2] = Card(3);
        cards[3] = Card(12);
        cards[4] = Card(6);
        gameId = 1; 
    }

    function joinTeam(uint _teamId) public payable {
        require(msg.value == ENTRY_FEE, "Entry Fee is 0.0067 QUAI");
        require(_teamId == 1 || _teamId == 2, "Invalid team. Choose 1 or 2");
        require(!players[gameId][msg.sender].hasJoined, "Already joined this game");
        require(winnerTeam == 0, "Game finished. Reset to play.");

        // Assign 5 random cards
        uint[] memory starterDeck = shuffleDeck(msg.sender);

        players[gameId][msg.sender] = Player({
            deck: starterDeck,
            team: _teamId,
            hasJoined: true
        });

        // Add to tracking arrays
        teamMembers[gameId][_teamId].push(msg.sender);

        teamSize[_teamId]++;
        teamCards[_teamId] += 5; 
        
        // Add to Pot
        gamePrizePool[gameId] += msg.value;

        emit PlayerJoined(gameId, msg.sender, _teamId);

        if (teamSize[1] >= 1 && teamSize[2] >= 1 && !gameActive && winnerTeam == 0) {
            startGame();
        }
    }

    function startGame() internal {
        teamHP[1] = MAX_HP;
        teamHP[2] = MAX_HP;
        currentTeamTurn = 1; 
        gameActive = true;
        winnerTeam = 0;
        emit GameStarted(gameId);
    }

    function resetGame() public {
        require(!gameActive, "Cannot reset while active");
        gameId++; 
        
        gameActive = false;
        teamHP[1] = MAX_HP;
        teamHP[2] = MAX_HP;
        teamSize[1] = 0;
        teamSize[2] = 0;
        teamCards[1] = 0;
        teamCards[2] = 0;
        winnerTeam = 0;
        currentTeamTurn = 1;
    }

    function shuffleDeck(address player) internal view returns (uint[] memory) {
        uint[] memory newDeck = new uint[](5);
        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, player, block.number, gameId)));
        for (uint i = 0; i < 5; i++) {
            newDeck[i] = uint256(keccak256(abi.encodePacked(seed, i))) % 5;
        }
        return newDeck;
    }

    function playCard(uint index) public {
        require(gameActive, "Game not active");
        Player storage p = players[gameId][msg.sender];
        require(p.hasJoined, "Not joined");
        require(p.team == currentTeamTurn, "Not your team's turn");
        require(index < p.deck.length, "Invalid card index");

        uint cardId = p.deck[index];
        uint damage = cards[cardId].attack;

        uint opponentTeam = (p.team == 1) ? 2 : 1;
        if (teamHP[opponentTeam] <= damage) {
            teamHP[opponentTeam] = 0;
            finishGame(p.team);
            return;
        } else {
            teamHP[opponentTeam] -= damage;
        }

        emit CardPlayed(msg.sender, p.team, cardId, damage);

        p.deck[index] = p.deck[p.deck.length - 1];
        p.deck.pop();
        teamCards[p.team]--; 

        if (teamCards[opponentTeam] == 0) {
            finishGame(p.team); 
            return;
        }

        currentTeamTurn = opponentTeam;
    }
    
    function finishGame(uint winner) internal {
        gameActive = false;
        winnerTeam = winner;
        
        // AUTO DISTRIBUTE REWARDS
        uint256 totalPool = gamePrizePool[gameId];
        address[] memory winners = teamMembers[gameId][winner];
        uint256 winnerCount = winners.length;

        if (winnerCount > 0 && totalPool > 0) {
            uint256 share = totalPool / winnerCount;
            // Iterate and pay (Limit loop size in production, but fine for hackathon <50 players)
            for (uint i = 0; i < winnerCount; i++) {
                payable(winners[i]).transfer(share);
                emit PayoutSent(winners[i], share);
            }
        }

        emit GameEnded(winner, totalPool);
    }

    function getMyDeck() public view returns (uint[] memory) {
        return players[gameId][msg.sender].deck;
    }

    function getGameState() public view returns (
        bool active,
        uint turn,
        uint winner,
        uint hp1,
        uint hp2,
        uint count1,
        uint count2,
        uint cards1,
        uint cards2,
        uint currentGameId,
        uint256 prizePool 
    ) {
        return (
            gameActive,
            currentTeamTurn,
            winnerTeam,
            teamHP[1],
            teamHP[2],
            teamSize[1],
            teamSize[2],
            teamCards[1],
            teamCards[2],
            gameId,
            gamePrizePool[gameId]
        );
    }
}
