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
        bool hasPlayedCard; // To lock shop after first move
        uint damageMultiplier; // 100 = 1x, 130 = 1.3x (Overclock)
        uint critChance; // 0 = 0%, 20 = 20% (Crit.exe)
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
        uint currentTurn;
        uint id;
    }

    // Config
    mapping(uint => Card) public cards;
    uint public constant TARGET_SCORE = 100;
    
    // Economy
    mapping(address => uint) public credits;
    uint public constant WIN_REWARD = 50;
    uint public constant LOSS_REWARD = 15;
    uint public constant STARTING_CREDITS = 200; // Bonus for new players
    
    // Config: Shop Costs
    uint public constant COST_OVERCLOCK = 100;
    uint public constant COST_FIREWALL = 150;
    uint public constant COST_CRIT = 125;
    uint public constant COST_EMP = 150;

    // State
    uint public nextGameId; 
    
    // Mappings
    mapping(uint => Game) public games;
    mapping(uint => mapping(address => Player)) public gamePlayers;
    mapping(uint => mapping(uint => address[])) public gameTeamMembers;
    
    // Track if user has claimed starter credits
    mapping(address => bool) public hasClaimedStarter;

    event GameCreated(uint gameId, address creator);
    event GameStarted(uint gameId, uint cardsPerTeam1, uint cardsPerTeam2);
    event PlayerJoined(uint gameId, address player, uint team);
    event CardPlayed(uint gameId, address player, uint team, uint cardId, uint damage, bool isCritical);
    event GameEnded(uint gameId, uint winningTeam);
    event AbilityPurchased(uint gameId, address player, string abilityType);
    event CreditsUpdated(address player, uint newBalance);

    constructor() {
        cards[0] = Card(5);
        cards[1] = Card(8);
        cards[2] = Card(3);
        cards[3] = Card(12);
        cards[4] = Card(6);
        nextGameId = 1; 
        
        createGame();
    }

    // Credit System Helpers
    function _addCredits(address _player, uint _amount) internal {
        credits[_player] += _amount;
        emit CreditsUpdated(_player, credits[_player]);
    }
    
    function _deductCredits(address _player, uint _amount) internal {
        require(credits[_player] >= _amount, "Insufficient Credits");
        credits[_player] -= _amount;
        emit CreditsUpdated(_player, credits[_player]);
    }

    function checkStarterCredits() public {
        if (!hasClaimedStarter[msg.sender]) {
            credits[msg.sender] = STARTING_CREDITS;
            hasClaimedStarter[msg.sender] = true;
            emit CreditsUpdated(msg.sender, STARTING_CREDITS);
        }
    }

    function createGame() public returns (uint) {
        checkStarterCredits();
        
        uint id = _generateRandomId();
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
        uint hash = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, block.difficulty)));
        return (hash % 9000000) + 1000000;
    }

    function joinTeam(uint _gameId, uint _teamId) public {
        checkStarterCredits();
        
        Game storage g = games[_gameId];
        require(g.id != 0, "Game does not exist");
        require(!g.active, "Game already started! No late joiners.");
        require(g.winner == 0, "Game finished.");
        require(_teamId == 1 || _teamId == 2, "Invalid team. Choose 1 or 2");
        
        Player storage p = gamePlayers[_gameId][msg.sender];
        require(!p.hasJoined, "Already joined this game");

        p.deck = new uint[](0);
        p.team = _teamId;
        p.hasJoined = true;
        p.hasPlayedCard = false;
        
        // Defaults
        p.damageMultiplier = 100; 
        p.critChance = 0;

        gameTeamMembers[_gameId][_teamId].push(msg.sender);
        
        if (_teamId == 1) g.size1++;
        else g.size2++;
        
        emit PlayerJoined(_gameId, msg.sender, _teamId);
    }

    function beginGame(uint _gameId) public {
        Game storage g = games[_gameId];
        require(!g.active, "Already active");
        require(g.winner == 0, "Game finished");
        require(g.size1 > 0 && g.size2 > 0, "Need players on both teams");
        
        uint common = lcm(g.size1, g.size2);
        uint totalTeamCards = common * 5; 

        uint c1 = totalTeamCards / g.size1;
        uint c2 = totalTeamCards / g.size2;

        _distributeCards(_gameId, 1, c1);
        _distributeCards(_gameId, 2, c2);

        g.cards1 = _countTeamCards(_gameId, 1);
        g.cards2 = _countTeamCards(_gameId, 2);

        g.ap1 = 0;
        g.ap2 = 0;
        g.currentTurn = 1; 
        g.active = true;

        emit GameStarted(_gameId, c1, c2);
    }
    
    // SHOP FUNCTIONALITY
    function purchaseAbility(uint _gameId, uint _abilityId) public {
        Game storage g = games[_gameId];
        require(g.active, "Game must be active to buy tactical upgrades");
        require(g.winner == 0, "Game finished");
        
        Player storage p = gamePlayers[_gameId][msg.sender];
        require(p.hasJoined, "Not in game");
        require(!p.hasPlayedCard, "Tactical Phase Over! You have already engaged.");
        
        if (_abilityId == 1) {
            // NEURAL OVERCLOCK (+30% DMG)
            require(p.damageMultiplier == 100, "Already Overclocked");
            _deductCredits(msg.sender, COST_OVERCLOCK);
            p.damageMultiplier = 130;
            emit AbilityPurchased(_gameId, msg.sender, "NEURAL_OVERCLOCK");
        } 
        else if (_abilityId == 2) {
            // FIREWALL EXPANSION (+2 Cards)
            _deductCredits(msg.sender, COST_FIREWALL);
            // Add 2 cards immediately
            uint[] memory extras = shuffleDeck(_gameId, msg.sender, 2);
            // Append manually
            uint len = p.deck.length;
            uint[] memory newDeck = new uint[](len + 2);
            for(uint i=0; i<len; i++) newDeck[i] = p.deck[i];
            newDeck[len] = extras[0];
            newDeck[len+1] = extras[1];
            p.deck = newDeck;
            
            // Update game stats
            if(p.team == 1) g.cards1 += 2; else g.cards2 += 2;
            
            emit AbilityPurchased(_gameId, msg.sender, "FIREWALL_EXPANSION");
        }
        else if (_abilityId == 3) {
            // CRIT.EXE (20% Double Dmg)
            require(p.critChance == 0, "Crit module already installed");
            _deductCredits(msg.sender, COST_CRIT);
            p.critChance = 20;
            emit AbilityPurchased(_gameId, msg.sender, "CRIT_EXE");
        }
        else if (_abilityId == 4) {
            // EMP BURST (10 Instant Dmg)
            _deductCredits(msg.sender, COST_EMP);
            if (p.team == 1) {
                g.ap1 += 10;
                if(g.ap1 >= TARGET_SCORE) { finishGame(_gameId, 1); return; }
            } else {
                g.ap2 += 10;
                if(g.ap2 >= TARGET_SCORE) { finishGame(_gameId, 2); return; }
            }
            emit AbilityPurchased(_gameId, msg.sender, "EMP_BURST");
        }
    }

    function _distributeCards(uint _gameId, uint teamId, uint count) internal {
        address[] memory members = gameTeamMembers[_gameId][teamId];
        for(uint i=0; i<members.length; i++) {
            gamePlayers[_gameId][members[i]].deck = shuffleDeck(_gameId, members[i], count);
        }
    }

    function _countTeamCards(uint _gameId, uint teamId) internal view returns (uint) {
        uint total = 0;
        address[] memory members = gameTeamMembers[_gameId][teamId];
        for(uint i=0; i<members.length; i++) {
            total += gamePlayers[_gameId][members[i]].deck.length;
        }
        return total;
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
        
        // Lock Shop
        if (!p.hasPlayedCard) {
            p.hasPlayedCard = true;
        }

        uint cardId = p.deck[index];
        uint baseDamage = cards[cardId].attack;
        
        // Apply Configured Multiplier (Overclock)
        uint mult = p.damageMultiplier;
        
        // Apply Critical Hit (Crit.exe)
        bool isCrit = false;
        if (p.critChance > 0) {
            // Pseudorandom roll
            uint roll = uint(keccak256(abi.encodePacked(block.timestamp, msg.sender, index))) % 100;
            if (roll < p.critChance) {
                mult = mult * 2; // Double damage on top of multiplier? Or set to 200? Let's stack multiplicative.
                // If 130 * 2 = 260% -> Huge hit.
                isCrit = true;
            }
        }
        
        uint finalDamage = (baseDamage * mult) / 100;
        uint opponentTeam = (p.team == 1) ? 2 : 1;

        if (p.team == 1) {
            g.ap1 += finalDamage;
            if (g.ap1 >= TARGET_SCORE) { 
                finishGame(_gameId, 1);
                return;
            }
        } else {
            g.ap2 += finalDamage;
            if (g.ap2 >= TARGET_SCORE) {
                finishGame(_gameId, 2);
                return;
            }
        }
        
        emit CardPlayed(_gameId, msg.sender, p.team, cardId, finalDamage, isCrit);

        // Remove Card
        p.deck[index] = p.deck[p.deck.length - 1];
        p.deck.pop();
        
        g.cards1 = _countTeamCards(_gameId, 1);
        g.cards2 = _countTeamCards(_gameId, 2);
        
        uint oppCards = (opponentTeam == 1) ? g.cards1 : g.cards2;
        uint myCards = (p.team == 1) ? g.cards1 : g.cards2;

        if (oppCards == 0) {
            if (myCards > 0) {
                finishGame(_gameId, p.team);
                return;
            } else {
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
        
        // Distribute Rewards
        address[] memory winners = gameTeamMembers[_gameId][_winner];
        uint loserTeam = (_winner == 1) ? 2 : 1;
        address[] memory losers = gameTeamMembers[_gameId][loserTeam];
        
        for (uint i = 0; i < winners.length; i++) {
            _addCredits(winners[i], WIN_REWARD);
        }
        
        for (uint i = 0; i < losers.length; i++) {
            _addCredits(losers[i], LOSS_REWARD);
        }

        emit GameEnded(_gameId, _winner);
    }

    function getPlayer(uint _gameId, address _player) public view returns (
        uint[] memory deck, 
        uint team, 
        bool hasJoined, 
        bool hasPlayed,
        uint dmgMult,
        uint critChance
    ) {
        Player storage p = gamePlayers[_gameId][_player];
        return (p.deck, p.team, p.hasJoined, p.hasPlayedCard, p.damageMultiplier, p.critChance);
    }
    
    function getCredits(address player) public view returns (uint) {
        return credits[player];
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
        uint id
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
            g.id
        );
    }

    function abortGame(uint _gameId) public {
        Game storage g = games[_gameId];
        require(gamePlayers[_gameId][msg.sender].hasJoined, "Only players can abort");
        g.active = false;
        g.winner = 3; 
        
        // Consolation for reset? Maybe small?
        // Let's give everyone 5 credits for the trouble
        address[] memory t1 = gameTeamMembers[_gameId][1];
        address[] memory t2 = gameTeamMembers[_gameId][2];
        
        for(uint i=0; i<t1.length; i++) _addCredits(t1[i], 5);
        for(uint i=0; i<t2.length; i++) _addCredits(t2[i], 5);
        
        emit GameEnded(_gameId, 3);
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
