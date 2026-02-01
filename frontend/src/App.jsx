import React, { useState, useEffect } from 'react';
import { quais, BrowserProvider, Contract } from 'quais';
import { parseEther, formatEther } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { Sword, Users, Zap, RefreshCw, ShieldAlert, Skull, Coins, Award } from 'lucide-react';

// Team Constants
const TEAM_RED = 1;
const TEAM_BLUE = 2;

const Card = ({ id, attack, onClick, disabled }) => (
  <div
    onClick={() => !disabled && onClick && onClick(id)}
    className={`relative w-36 h-56 rounded-xl border-4 transition-all duration-300 transform 
      ${disabled ? 'opacity-50 grayscale cursor-not-allowed' : 'hover:scale-105 cursor-pointer bg-slate-800 border-slate-600 hover:border-yellow-400 shadow-xl hover:shadow-yellow-500/20'}
      flex flex-col items-center justify-between p-4 overflow-hidden group`}
  >
    <div className="absolute top-0 right-0 p-2 text-xs font-mono text-slate-500">#{id}</div>

    <div className="mt-4 p-4 bg-slate-900 rounded-full group-hover:bg-slate-700 transition-colors">
      <Sword size={48} className="text-slate-200 group-hover:text-yellow-400 transition-colors" />
    </div>

    <div className="w-full mt-4">
      <div className="text-center text-xs text-slate-400 uppercase tracking-widest mb-1">Damage</div>
      <div className="flex items-center justify-center space-x-2 bg-black/40 py-2 rounded-lg border border-slate-700">
        <span className="text-3xl font-black text-white">{attack}</span>
      </div>
    </div>
  </div>
);

function App() {
  const [wallet, setWallet] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [myTeam, setMyTeam] = useState(0); // 0 = None, 1 = Red, 2 = Blue
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Game State
  const [gameState, setGameState] = useState({
    active: false,
    turn: 0,
    winner: 0,
    hp1: 100,
    hp2: 100,
    count1: 0,
    count2: 0,
    cards1: 0,
    cards2: 0,
    gameId: 1,
    prizePool: "0"
  });

  const [myDeck, setMyDeck] = useState([]);

  const connectWallet = async () => {
    setLoading(true);
    setError('');
    try {
      if (!window.pelagus && !window.ethereum) throw new Error("Install Pelagus Wallet!");

      const provider = new BrowserProvider(window.pelagus || window.ethereum);
      await provider.send("quai_requestAccounts", []);
      const signer = await provider.getSigner();
      const userAddress = await signer.getAddress();
      const gameContract = new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);

      setWallet(signer);
      setAccount(userAddress);
      setContract(gameContract);

      fetchGameState(gameContract, userAddress);

    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchGameState = async (gameContract = contract, userAddr = account) => {
    if (!gameContract) return;
    try {
      const status = await gameContract.getGameState();
      // Returns (active, turn, winner, hp1, hp2, count1, count2, cards1, cards2, gameId, prizePool)
      const newState = {
        active: status[0],
        turn: Number(status[1]),
        winner: Number(status[2]),
        hp1: Number(status[3]),
        hp2: Number(status[4]),
        count1: Number(status[5]),
        count2: Number(status[6]),
        cards1: Number(status[7]),
        cards2: Number(status[8]),
        gameId: Number(status[9]),
        prizePool: status[10] ? formatEther(status[10]) : "0"
      };
      setGameState(newState);

      const currentGameId = status[9];

      // Update my team status if needed
      if (userAddr) {
        try {
          const p = await gameContract.players(currentGameId, userAddr);

          if (p.hasJoined) {
            setMyTeam(Number(p.team));
            // Fetch deck
            const deckIds = await gameContract.getMyDeck();
            const newDeck = [];
            for (let i = 0; i < deckIds.length; i++) {
              const cId = deckIds[i];
              const card = await gameContract.cards(cId);
              const attackVal = card.attack !== undefined ? card.attack : card;
              newDeck.push({
                id: Number(cId),
                attack: Number(attackVal),
                index: i
              });
            }
            setMyDeck(newDeck);
          } else {
            setMyTeam(0);
            setMyDeck([]);
          }
        } catch (e) {
          console.log("Player fetch error or not in game", e);
        }
      }

    } catch (err) {
      console.error("Fetch Error:", err);
    }
  };

  useEffect(() => {
    if (contract) {
      const interval = setInterval(() => fetchGameState(contract), 2000);
      return () => clearInterval(interval);
    }
  }, [contract, account]);

  const joinTeam = async (teamId) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.joinTeam(teamId, {
        value: parseEther("0.0067"),
        gasLimit: 5000000
      });
      await tx.wait();
      fetchGameState(contract);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const playCard = async (index) => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.playCard(index, { gasLimit: 5000000 });
      await tx.wait();
      fetchGameState(contract);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const resetGame = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.resetGame({ gasLimit: 5000000 });
      await tx.wait();
      window.location.reload();
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  // derived state
  const isRedTurn = gameState.turn === TEAM_RED;
  const isBlueTurn = gameState.turn === TEAM_BLUE;
  const isMyTurn = (myTeam === TEAM_RED && isRedTurn) || (myTeam === TEAM_BLUE && isBlueTurn);
  const isMyTeamWinner = myTeam === gameState.winner;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-game selection:bg-yellow-500/30">

      {/* Game Over Overlay */}
      {gameState.winner > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-in fade-in duration-500">
          <div className={`bg-slate-900 border-4 rounded-3xl p-12 text-center shadow-2xl transform scale-100 ${gameState.winner === TEAM_RED ? 'border-red-600 shadow-red-900/50' : 'border-blue-600 shadow-blue-900/50'}`}>
            <div className="mb-6 animate-bounce">
              {gameState.winner === TEAM_RED ?
                <Sword size={80} className="mx-auto text-red-500" /> :
                <ShieldAlert size={80} className="mx-auto text-blue-500" />
              }
            </div>
            <h2 className={`text-6xl font-black mb-2 uppercase tracking-tighter ${gameState.winner === TEAM_RED ? 'text-red-500' : 'text-blue-500'}`}>
              {gameState.winner === TEAM_RED ? 'RED TEAM' : 'BLUE TEAM'}
            </h2>
            <h3 className="text-4xl font-extrabold text-white mb-6">
              VICTORIOUS
            </h3>

            {isMyTeamWinner && (
              <div className="mb-8 p-4 bg-green-500/20 border border-green-500 rounded-xl text-green-300 animate-pulse">
                <div className="flex flex-col items-center">
                  <Award size={32} className="mb-2" />
                  <span className="text-xl font-bold">REWARDS SENT!</span>
                  <span className="text-sm">Check your wallet</span>
                </div>
              </div>
            )}

            <button
              onClick={resetGame}
              className="px-6 py-3 bg-slate-100 hover:bg-slate-300 text-slate-900 font-bold rounded-lg"
            >
              Start New War
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="p-4 bg-slate-900 border-b border-slate-800 flex justify-between items-center sticky top-0 z-20 shadow-xl">
        <div className="flex items-center space-x-2">
          <div className="p-2 bg-yellow-500 rounded text-black"><Sword size={20} fill="currentColor" /></div>
          <h1 className="text-xl font-bold tracking-wider hidden md:block">TEAM BATTLE</h1>
        </div>

        {/* Prize Pool Display */}
        <div className="px-6 py-2 bg-slate-800 rounded-full border border-yellow-500/30 flex items-center space-x-2 shadow-lg">
          <Coins size={18} className="text-yellow-400" />
          <span className="text-yellow-100 font-bold font-mono">{gameState.prizePool} QUAI</span>
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Pot</span>
        </div>

        {account && (
          <div className="flex items-center space-x-4">
            <button onClick={resetGame} className="px-3 py-1 bg-red-950 border border-red-600 rounded text-xs text-red-400 font-bold hover:bg-red-900 transition-colors uppercase">Reset War</button>
            <div className="text-xs font-mono text-slate-500 hidden sm:block">{account.substring(0, 6)}...</div>
            <button onClick={() => fetchGameState()}><RefreshCw size={16} /></button>
          </div>
        )}
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/50 rounded text-red-200 flex items-center shadow-lg animate-pulse">
            <ShieldAlert className="mr-3" /> {error}
          </div>
        )}

        {/* 1. Connect Wallet */}
        {!account && (
          <div className="flex flex-col items-center justify-center py-20">
            <h2 className="text-4xl font-black mb-8 text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-blue-500">
              CHOOSE YOUR FACTION
            </h2>
            <button onClick={connectWallet} className="px-8 py-4 bg-slate-100 text-slate-900 font-black rounded-xl text-xl hover:scale-105 transition-transform flex items-center">
              <Zap className="mr-2" /> CONNECT WALLET
            </button>
          </div>
        )}

        {/* 2. Lobby (Join Team) */}
        {account && myTeam === 0 && !gameState.winner && (
          <div className="grid md:grid-cols-2 gap-8 py-12">
            {/* Red Team */}
            <div className="bg-red-950/30 border-2 border-red-900/50 rounded-2xl p-8 flex flex-col items-center hover:bg-red-900/40 transition-colors group">
              <h3 className="text-3xl font-black text-red-500 mb-2">RED TEAM</h3>
              <p className="text-red-300 mb-1">{gameState.count1} Players Joined</p>
              <p className="text-red-400/60 mb-6 text-sm uppercase tracking-wider">{gameState.cards1} cards in arsenal</p>
              <div className="mb-6 flex items-center space-x-2 bg-black/40 px-4 py-2 rounded-lg border border-red-500/30">
                <Coins size={16} className="text-yellow-500" />
                <span className="text-red-200 font-bold">0.0067 QUAI</span>
              </div>
              <button
                onClick={() => joinTeam(TEAM_RED)}
                disabled={loading}
                className="mt-auto px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg shadow-lg shadow-red-900/50 w-full"
              >
                {loading ? 'Processing...' : 'JOIN RED'}
              </button>
            </div>

            {/* Blue Team */}
            <div className="bg-blue-950/30 border-2 border-blue-900/50 rounded-2xl p-8 flex flex-col items-center hover:bg-blue-900/40 transition-colors group">
              <h3 className="text-3xl font-black text-blue-500 mb-2">BLUE TEAM</h3>
              <p className="text-blue-300 mb-1">{gameState.count2} Players Joined</p>
              <p className="text-blue-400/60 mb-6 text-sm uppercase tracking-wider">{gameState.cards2} cards in arsenal</p>
              <div className="mb-6 flex items-center space-x-2 bg-black/40 px-4 py-2 rounded-lg border border-blue-500/30">
                <Coins size={16} className="text-yellow-500" />
                <span className="text-blue-200 font-bold">0.0067 QUAI</span>
              </div>
              <button
                onClick={() => joinTeam(TEAM_BLUE)}
                disabled={loading}
                className="mt-auto px-8 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg shadow-lg shadow-blue-900/50 w-full"
              >
                {loading ? 'Processing...' : 'JOIN BLUE'}
              </button>
            </div>
          </div>
        )}

        {/* 3. Game Board */}
        {account && (myTeam !== 0 || gameState.active) && (
          <div className="space-y-12">

            {/* Scoreboard */}
            <div className="relative h-24 bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 flex shadow-2xl">
              {/* Red Bar */}
              <div className="h-full bg-red-600 transition-all duration-700 flex flex-col justify-center px-6 relative" style={{ flex: Math.max(gameState.hp1, 0.1) }}>
                <div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20"></div>
                <span className="text-4xl font-black text-white z-10 drop-shadow-md leading-none">{gameState.hp1}</span>
                <span className="text-xs text-red-100 font-bold z-10 opacity-80 mt-1">CARDS: {gameState.cards1 || 0}</span>
              </div>

              {/* Blue Bar */}
              <div className="h-full bg-blue-600 transition-all duration-700 flex flex-col justify-center items-end px-6 relative" style={{ flex: Math.max(gameState.hp2, 0.1) }}>
                <div className="absolute inset-0 bg-gradient-to-l from-transparent to-black/20"></div>
                <span className="text-4xl font-black text-white z-10 drop-shadow-md leading-none">{gameState.hp2}</span>
                <span className="text-xs text-blue-100 font-bold z-10 opacity-80 mt-1">CARDS: {gameState.cards2 || 0}</span>
              </div>

              {/* VS Badge */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-slate-950 rounded-full border-4 border-slate-800 flex items-center justify-center font-black text-slate-500 z-20">
                VS
              </div>
            </div>

            {/* Turn Indicator / Game Message */}
            <div className="text-center">
              {gameState.winner > 0 ? (
                <div className="animate-bounce">
                  <h2 className={`text-6xl font-black ${gameState.winner === TEAM_RED ? 'text-red-500' : 'text-blue-500'}`}>
                    {gameState.winner === TEAM_RED ? 'RED TEAM WINS!' : 'BLUE TEAM WINS!'}
                  </h2>
                </div>
              ) : (
                <div>
                  <div className={`inline-block px-8 py-2 rounded-full text-xl font-bold border-2 ${isRedTurn ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-blue-500/20 border-blue-500 text-blue-500'
                    }`}>
                    {isRedTurn ? "RED TEAM'S TURN" : "BLUE TEAM'S TURN"}
                  </div>

                  {myTeam !== 0 && (
                    <p className="mt-4 text-slate-400">
                      You are on <span className={myTeam === TEAM_RED ? 'text-red-500 font-bold' : 'text-blue-500 font-bold'}>
                        {myTeam === TEAM_RED ? 'TEAM RED' : 'TEAM BLUE'}
                      </span>
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* My Hand */}
            {myTeam !== 0 && !gameState.winner && (
              <div className="bg-slate-900/50 p-8 rounded-3xl border border-slate-700/50">
                <h3 className="text-center text-slate-500 mb-8 uppercase tracking-widest font-bold">Your Arsenal</h3>

                {myDeck.length === 0 ? (
                  <div className="text-center text-slate-600 italic">You have no cards left. Cheer for your team!</div>
                ) : (
                  <div className="flex flex-wrap justify-center gap-6">
                    {myDeck.map(card => (
                      <Card
                        key={card.index}
                        {...card}
                        onClick={() => playCard(card.index)}
                        disabled={!isMyTurn || loading}
                      />
                    ))}
                  </div>
                )}

                {!isMyTurn && myDeck.length > 0 && (
                  <div className="text-center mt-6 text-slate-500 animate-pulse">
                    Waiting for opponents...
                  </div>
                )}
              </div>
            )}

          </div>
        )}

      </main>
    </div>
  );
}

export default App;
