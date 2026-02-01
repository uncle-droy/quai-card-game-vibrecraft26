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

    // Game Config
    mapping(uint => Card) public cards;
    uint public constant MAX_HP = 100;
    
    // State
    uint public gameId; // Session ID (Epoch)
    mapping(uint => mapping(address => Player)) public players; // gameId => address => Player
    
    mapping(uint => uint) public teamHP;   // Team ID => HP
    mapping(uint => uint) public teamSize; // Team ID => Player Count
    mapping(uint => uint) public teamCards; // Team ID => Total Cards Left

    uint public currentTeamTurn; // 1 or 2
    bool public gameActive;
    uint public winnerTeam;

    event GameStarted(uint gameId);
    event PlayerJoined(uint gameId, address player, uint team);
    event CardPlayed(address player, uint team, uint cardId, uint damage);
    event GameEnded(uint winningTeam);

    constructor() {
        cards[0] = Card(5);
        cards[1] = Card(8);
        cards[2] = Card(3);
        cards[3] = Card(12);
        cards[4] = Card(6);
        gameId = 1; // Start at 1
    }

    function joinTeam(uint _teamId) public {
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

        teamSize[_teamId]++;
        teamCards[_teamId] += 5; // Add to team total

        emit PlayerJoined(gameId, msg.sender, _teamId);

        // Auto-start if both teams have players and game is inactive
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
        // Increment Epoc to invalidate previous players
        gameId++; 
        
        // Reset Board
        gameActive = false;
        teamHP[1] = MAX_HP;
        teamHP[2] = MAX_HP;
        teamSize[1] = 0;
        teamSize[2] = 0;
        teamCards[1] = 0;
        teamCards[2] = 0;
        winnerTeam = 0;
        
        currentTeamTurn = 1;
        // Do NOT start until people join the new gameId
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

        // Damage Opponent
        uint opponentTeam = (p.team == 1) ? 2 : 1;
        if (teamHP[opponentTeam] <= damage) {
            teamHP[opponentTeam] = 0;
            finishGame(p.team);
            return;
        } else {
            teamHP[opponentTeam] -= damage;
        }

        emit CardPlayed(msg.sender, p.team, cardId, damage);

        // Remove card
        p.deck[index] = p.deck[p.deck.length - 1];
        p.deck.pop();
        teamCards[p.team]--; // Decrement team card count

        // Check Win Condition: Fatigue / Total Domination
        // If the opponent team has 0 cards left, they cannot win. Current team wins.
        // Also check if current team ran out of cards? No, they just played, so they had at least 1.
        if (teamCards[opponentTeam] == 0) {
            finishGame(p.team); // You win because opponent is defenseless
            return;
        }

        // Switch Turn
        currentTeamTurn = opponentTeam;
    }
    
    function finishGame(uint winner) internal {
        gameActive = false;
        winnerTeam = winner;
        emit GameEnded(winner);
    }

    // Read Helpers
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
        uint currentGameId
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
            gameId
        );
    }
}
