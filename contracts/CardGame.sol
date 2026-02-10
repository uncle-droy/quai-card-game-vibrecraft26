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

    struct Game {
        bool active;
        uint winner;
        uint ap1; // Annihilation Points (Target: 100)
        uint ap2;
        uint size1;
        uint size2;
        uint cards1;
        uint cards2;
        uint prizePool;
        uint currentTurn;
        uint id;
    }

    // Config
    mapping(uint => Card) public cards;
    uint public constant TARGET_SCORE = 100;
    uint256 public constant ENTRY_FEE = 0.0067 ether; 
    
    // State
    uint public nextGameId; 
    
    // Mappings
    mapping(uint => Game) public games;
    // gameId => address => Player
    mapping(uint => mapping(address => Player)) public gamePlayers;
    // gameId => teamId => address[]
    mapping(uint => mapping(uint => address[])) public gameTeamMembers;

    event GameCreated(uint gameId, address creator);
    event GameStarted(uint gameId, uint cardsPerTeam1, uint cardsPerTeam2);
    event PlayerJoined(uint gameId, address player, uint team);
    event CardPlayed(uint gameId, address player, uint team, uint cardId, uint damage);
    event GameEnded(uint gameId, uint winningTeam, uint256 totalPrize);
    event PayoutSent(uint gameId, address player, uint256 amount);

    constructor() {
        cards[0] = Card(5);
        cards[1] = Card(8);
        cards[2] = Card(3);
        cards[3] = Card(12);
        cards[4] = Card(6);
        nextGameId = 1; 
        
        // Auto-create Game 1 for backward compatibility/ease
        createGame();
    }

    function createGame() public returns (uint) {
        uint id = _generateRandomId();
        // Simple collision check (rare for 7 digits with low volume, but good practice)
        // If collision, try once more with different seed
        if (games[id].id != 0) {
            id = _generateRandomId();
        }
        require(games[id].id == 0, "Game ID collision, try again");

        Game storage g = games[id];
        g.id = id;
        g.ap1 = 0;
        g.ap2 = 0;
        g.currentTurn = 1;
        g.active = false; 
        
        emit GameCreated(id, msg.sender);
        return id;
    }

    function _generateRandomId() internal view returns (uint) {
        // Generate random 7-digit number (1000000 - 9999999)
        uint hash = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.difficulty)));
        return (hash % 9000000) + 1000000;
    }

    function joinTeam(uint _gameId, uint _teamId) public payable {
        Game storage g = games[_gameId];
        require(g.id != 0, "Game does not exist");
        require(!g.active, "Game already started! No late joiners.");
        require(g.winner == 0, "Game finished.");
        require(msg.value == ENTRY_FEE, "Entry Fee is 0.0067 QUAI");
        require(_teamId == 1 || _teamId == 2, "Invalid team. Choose 1 or 2");
        
        Player storage p = gamePlayers[_gameId][msg.sender];
        require(!p.hasJoined, "Already joined this game");

        p.deck = new uint[](0);
        p.team = _teamId;
        p.hasJoined = true;

        gameTeamMembers[_gameId][_teamId].push(msg.sender);
        
        if (_teamId == 1) g.size1++;
        else g.size2++;
        
        // Add to Pot
        g.prizePool += msg.value;

        emit PlayerJoined(_gameId, msg.sender, _teamId);
    }

    // Manual Start
    function beginGame(uint _gameId) public {
        Game storage g = games[_gameId];
        require(!g.active, "Already active");
        require(g.winner == 0, "Game finished");
        require(g.size1 > 0 && g.size2 > 0, "Need players on both teams");
        
        // 1. Calculate LCM-based balancing
        uint common = lcm(g.size1, g.size2);
        uint totalTeamCards = common * 5; 

        uint c1 = totalTeamCards / g.size1;
        uint c2 = totalTeamCards / g.size2;

        // 2. Distribute Cards
        _distributeCards(_gameId, 1, c1);
        _distributeCards(_gameId, 2, c2);

        g.cards1 = totalTeamCards;
        g.cards2 = totalTeamCards;

        // g.ap1/ap2 are already set in createGame or reset
        // Ensure they are fresh just in case
        g.ap1 = 0;
        g.ap2 = 0;
        g.currentTurn = 1; 
        g.active = true;

        emit GameStarted(_gameId, c1, c2);
    }

    function _distributeCards(uint _gameId, uint teamId, uint count) internal {
        address[] memory members = gameTeamMembers[_gameId][teamId];
        for(uint i=0; i<members.length; i++) {
            gamePlayers[_gameId][members[i]].deck = shuffleDeck(_gameId, members[i], count);
        }
    }

    function shuffleDeck(uint _gameId, address player, uint count) internal view returns (uint[] memory) {
        uint[] memory newDeck = new uint[](count);
        uint256 seed = uint256(keccak256(abi.encodePacked(block.timestamp, player, block.number, _gameId)));
        for (uint i = 0; i < count; i++) {
            newDeck[i] = uint256(keccak256(abi.encodePacked(seed, i))) % 5;
        }
        return newDeck;
    }

    function playCard(uint _gameId, uint index) public {
        Game storage g = games[_gameId];
        require(g.active, "Game not active");
        
        Player storage p = gamePlayers[_gameId][msg.sender];
        require(p.hasJoined, "Not joined");
        require(p.team == g.currentTurn, "Not your team's turn");
        require(index < p.deck.length, "Invalid card index");

        // Damage Logic (Renamed HP to AP - Annihilation Points)
        uint cardId = p.deck[index];
        uint damage = cards[cardId].attack;
        uint opponentTeam = (p.team == 1) ? 2 : 1;

        // We add damage to OUR team's score. First to 100 wins.
        if (p.team == 1) {
            g.ap1 += damage;
            if (g.ap1 >= TARGET_SCORE) { 
                finishGame(_gameId, 1);
                return;
            }
        } else {
            g.ap2 += damage;
            if (g.ap2 >= TARGET_SCORE) {
                finishGame(_gameId, 2);
                return;
            }
        }
        
        emit CardPlayed(_gameId, msg.sender, p.team, cardId, damage);

        // Remove Card
        p.deck[index] = p.deck[p.deck.length - 1];
        p.deck.pop();
        
        if(p.team == 1) g.cards1--; else g.cards2--;
        
        uint oppCards = (opponentTeam == 1) ? g.cards1 : g.cards2;
        uint myCards = (p.team == 1) ? g.cards1 : g.cards2;

        // Check Win Condition: Fatigue / Total Domination (Mercy Rule)
        if (oppCards == 0) {
            if (myCards > 0) {
                finishGame(_gameId, p.team);
                return;
            }
            // Both Exhausted -> Compare AP (Higher Score Wins)
            else {
                if(p.team == 1) {
                     if (g.ap1 >= g.ap2) finishGame(_gameId, 1);
                     else finishGame(_gameId, 2);
                } else {
                     if (g.ap2 >= g.ap1) finishGame(_gameId, 2);
                     else finishGame(_gameId, 1);
                }
                return;
            }
        }

        g.currentTurn = opponentTeam;
    }
    
    function finishGame(uint _gameId, uint _winner) internal {
        Game storage g = games[_gameId];
        g.active = false;
        g.winner = _winner;
        
        uint256 totalPool = g.prizePool;
        address[] memory winners = gameTeamMembers[_gameId][_winner];
        uint256 winnerCount = winners.length;

        if (winnerCount > 0 && totalPool > 0) {
            uint256 share = totalPool / winnerCount;
            for (uint i = 0; i < winnerCount; i++) {
                (bool success, ) = winners[i].call{value: share}("");
                require(success, "Transfer failed");
                emit PayoutSent(_gameId, winners[i], share);
            }
        }

        emit GameEnded(_gameId, _winner, totalPool);
    }

    function getMyDeck(uint _gameId) public view returns (uint[] memory) {
        return gamePlayers[_gameId][msg.sender].deck;
    }
    
    // Helper to get player info cleanly
    function getPlayer(uint _gameId, address _player) public view returns (uint[] memory deck, uint team, bool hasJoined) {
        Player storage p = gamePlayers[_gameId][_player];
        return (p.deck, p.team, p.hasJoined);
    }

    function getGameState(uint _gameId) public view returns (
        bool active,
        uint turn,
        uint winner,
        uint ap1,
        uint ap2,
        uint count1,
        uint count2,
        uint cards1,
        uint cards2,
        uint id,
        uint256 prizePool 
    ) {
        Game storage g = games[_gameId];
        return (
            g.active,
            g.currentTurn,
            g.winner,
            g.ap1,
            g.ap2,
            g.size1,
            g.size2,
            g.cards1,
            g.cards2,
            g.id,
            g.prizePool
        );
    }

    function abortGame(uint _gameId) public {
        Game storage g = games[_gameId];
        require(gamePlayers[_gameId][msg.sender].hasJoined, "Only players can abort");
        
        g.active = false;
        g.winner = 3; // 3 = Aborted/Reset code
        
        emit GameEnded(_gameId, 3, 0);
    }

    function gcd(uint a, uint b) internal pure returns (uint) {
        if (b == 0) return a;
        return gcd(b, a % b);
    }

    function lcm(uint a, uint b) internal pure returns (uint) {
        if (a == 0 || b == 0) return 0;
        return (a * b) / gcd(a, b);
    }
}
