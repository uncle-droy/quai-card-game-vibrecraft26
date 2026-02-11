import React, { useState, useEffect } from 'react';
import { quais, BrowserProvider, Contract } from 'quais';
import { parseEther, formatEther } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI } from './constants';
import { Sword, Users, Zap, RefreshCw, ShieldAlert, Skull, Coins, Award, Play, Home, Plus, Flame, Target } from 'lucide-react';

const TEAM_RED = 1;
const TEAM_BLUE = 2;

const Card = ({ id, attack, onClick, disabled }) => (
  <div
    onClick={() => !disabled && onClick && onClick(id)}
    className={`relative group w-40 h-64 rounded-xl transition-all duration-300 transform 
      ${disabled ? 'opacity-50 grayscale cursor-not-allowed scale-95' : 'hover:scale-105 cursor-pointer hover:-translate-y-2'}
      border-2 border-slate-700 bg-slate-900 overflow-hidden shadow-2xl hover:shadow-[0_0_30px_rgba(234,179,8,0.3)]
    `}
  >
    {/* Holo Effect Overlay */}
    <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-20 transition-opacity pointer-events-none z-10"></div>

    <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-500">SR-{id}</div>

    <div className="h-2/3 flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 border-b border-slate-700 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10"></div>
      <Sword size={64} className="text-slate-600 group-hover:text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)] transition-all duration-500" />
    </div>

    <div className="h-1/3 flex flex-col items-center justify-center bg-slate-950 p-2 relative">
      <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Impact</div>
      <div className="flex items-center space-x-2">
        <span className="text-4xl font-black text-white slashed-zero">{attack}</span>
        <Target size={16} className="text-red-500 animate-pulse" />
      </div>
    </div>
  </div>
);

function App() {
  const [wallet, setWallet] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [myTeam, setMyTeam] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [currentGameId, setCurrentGameId] = useState(null);
  const [gameIdInput, setGameIdInput] = useState('');

  const [gameState, setGameState] = useState({
    active: false,
    turn: 0,
    winner: 0,
    ap1: 0, // Annihilation Points (Start 0, Target 100)
    ap2: 0,
    count1: 0,
    count2: 0,
    cards1: 0,
    cards2: 0,
    gameId: 0,
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
    } catch (err) {
      console.error(err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const createGame = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.createGame();
      const receipt = await tx.wait();
      let newGameId = null;
      if (receipt.logs) {
        for (const log of receipt.logs) {
          try {
            const parsed = contract.interface.parseLog(log);
            if (parsed.name === 'GameCreated') {
              newGameId = Number(parsed.args[0]);
              break;
            }
          } catch (e) { }
        }
      }
      if (newGameId) {
        setCurrentGameId(newGameId);
        fetchGameState(contract, account, newGameId);
      } else {
        alert("Game Created. Check explorer for ID.");
      }
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const joinGameLobby = async () => {
    const id = Number(gameIdInput);
    if (!id || id < 1) return;
    setCurrentGameId(id);
    fetchGameState(contract, account, id);
  };

  const fetchGameState = async (gameContract = contract, userAddr = account, gId = currentGameId) => {
    if (!gameContract || !gId) return;
    try {
      const status = await gameContract.getGameState(gId);

      if (Number(status[9]) === 0) {
        setError("Invalid Game ID");
        setCurrentGameId(null);
        return;
      }

      const newState = {
        active: status[0],
        turn: Number(status[1]),
        winner: Number(status[2]),
        ap1: Number(status[3]), // AP!
        ap2: Number(status[4]), // AP!
        count1: Number(status[5]),
        count2: Number(status[6]),
        cards1: Number(status[7]),
        cards2: Number(status[8]),
        gameId: Number(status[9]),
        prizePool: status[10] ? formatEther(status[10]) : "0"
      };
      setGameState(newState);

      if (userAddr) {
        try {
          const p = await gameContract.getPlayer(gId, userAddr);
          if (p[2]) {
            setMyTeam(Number(p[1]));
            const deckIds = p[0];
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
        } catch (e) { }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (contract && currentGameId) {
      const interval = setInterval(() => fetchGameState(contract, account, currentGameId), 2000);
      return () => clearInterval(interval);
    }
  }, [contract, account, currentGameId]);

  const joinTeam = async (teamId) => {
    if (!contract || !currentGameId) return;
    setLoading(true);
    try {
      const tx = await contract.joinTeam(currentGameId, teamId, { value: parseEther("0.0067"), gasLimit: 5000000 });
      await tx.wait();
      fetchGameState(contract, account, currentGameId);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const beginGame = async () => {
    if (!contract || !currentGameId) return;
    setLoading(true);
    try {
      const tx = await contract.beginGame(currentGameId, { gasLimit: 8000000 });
      await tx.wait();
      fetchGameState(contract, account, currentGameId);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const playCard = async (index) => {
    if (!contract || !currentGameId) return;
    setLoading(true);
    try {
      const tx = await contract.playCard(currentGameId, index, { gasLimit: 5000000 });
      await tx.wait();
      fetchGameState(contract, account, currentGameId);
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const abortGame = async () => {
    if (!contract || !currentGameId) return;
    if (!window.confirm("ARE YOU SURE? This will destroy the lobby for everyone!")) return;
    setLoading(true);
    try {
      const tx = await contract.abortGame(currentGameId, { gasLimit: 5000000 });
      await tx.wait();
      fetchGameState(contract, account, currentGameId);
    } catch (err) {
      if (err.message.includes("Only players")) alert("You must join a team first!");
      setError(err.reason || err.message);
    } finally {
      setLoading(false);
    }
  };

  const leaveLobby = () => {
    setCurrentGameId(null);
    setGameState({ ...gameState, active: false, winner: 0 });
    setMyTeam(0);
    setGameIdInput('');
    setLoading(false);
    setError('');
  }

  // Auto-leave if game is aborted
  useEffect(() => {
     if (gameState.winner === 3) {
         const timer = setTimeout(() => {
             leaveLobby();
             alert("Lobby was destroyed/reset by a player. Returning to menu...");
         }, 3000);
         return () => clearTimeout(timer);
     }
  }, [gameState.winner]);

  const isRedTurn = gameState.turn === TEAM_RED;
  const isBlueTurn = gameState.turn === TEAM_BLUE;
  const isMyTurn = (myTeam === TEAM_RED && isRedTurn) || (myTeam === TEAM_BLUE && isBlueTurn);
  const targetAP = 100;

  // LANDING
  if (!account) {
    return (
      <div className="min-h-screen bg-black text-white font-sans flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-black to-black"></div>

        <div className="z-10 text-center space-y-8 animate-in fade-in zoom-in duration-1000">
          <h1 className="text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-yellow-500 to-blue-500 drop-shadow-[0_0_30px_rgba(255,255,255,0.2)]">
            NEON WAR
          </h1>
          <p className="text-slate-400 text-xl tracking-widest uppercase font-mono">Atomic Card Battles on Quai Network</p>

          <button onClick={connectWallet} className="group relative px-12 py-5 bg-white text-black font-black text-2xl rounded-none skew-x-[-10deg] hover:bg-yellow-400 transition-colors">
            <div className="skew-x-[10deg] flex items-center">
              <Zap className="mr-3 fill-current" /> CONNECT SYSTEM
            </div>
            <div className="absolute inset-0 border-2 border-white group-hover:border-yellow-400 rounded-none skew-x-[-10deg] translate-x-1 translate-y-1 -z-10 transition-transform group-hover:translate-x-2 group-hover:translate-y-2"></div>
          </button>
        </div>
        {error && <div className="z-20 mt-8 text-red-500 font-mono bg-red-950/50 p-4 border border-red-500">{error}</div>}
      </div>
    )
  }

  // LOBBY SELECTOR
  if (account && !currentGameId) {
    return (
      <div className="min-h-screen bg-black text-white font-sans p-8 relative">
        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-5"></div>

        <header className="flex justify-between items-center mb-20 relative z-10">
          <h1 className="text-3xl font-black italic tracking-tighter flex items-center gap-2 text-white"><Sword className="text-yellow-500" /> NEON WAR</h1>
          <div className="font-mono text-emerald-400 text-sm border border-emerald-900 bg-emerald-950/30 px-4 py-2 rounded">
            ID: {account.substring(0, 8)}...
          </div>
        </header>

        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-16 relative z-10">
          {/* Create */}
          <div className="group bg-slate-900/50 p-10 border border-slate-800 hover:border-yellow-500 transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
            <Flame size={64} className="text-slate-700 group-hover:text-yellow-500 mb-6 transition-colors" />
            <h2 className="text-4xl font-black mb-4 uppercase italic">Deploy Lobby</h2>
            <p className="text-slate-500 mb-8 font-mono text-sm leading-relaxed">Initialize a new battlefield protocol on the blockchain.</p>
            <button
              onClick={createGame}
              disabled={loading}
              className="w-full py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-xl tracking-wider skew-x-[-6deg] transition-all hover:shadow-[0_0_20px_rgba(234,179,8,0.4)]"
            >
              {loading ? 'INITIALIZING...' : 'CREATE ZONE'}
            </button>
          </div>

          {/* Join */}
          <div className="group bg-slate-900/50 p-10 border border-slate-800 hover:border-blue-500 transition-all duration-300 flex flex-col items-center text-center relative overflow-hidden">
            <div className="absolute top-0 right-0 w-full h-1 bg-blue-500 scale-x-0 group-hover:scale-x-100 transition-transform origin-right"></div>
            <Users size={64} className="text-slate-700 group-hover:text-blue-500 mb-6 transition-colors" />
            <h2 className="text-4xl font-black mb-4 uppercase italic">Infiltrate Zone</h2>
            <p className="text-slate-500 mb-8 font-mono text-sm leading-relaxed">Enter an existing combat code to join the fray.</p>
            <div className="flex w-full gap-4">
              <input
                type="number"
                placeholder="ENTER 7-DIGIT CODE"
                value={gameIdInput}
                onChange={(e) => setGameIdInput(e.target.value)}
                className="flex-1 bg-black border border-slate-700 focus:border-blue-500 px-6 py-4 text-white font-mono placeholder:text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
              <button
                onClick={joinGameLobby}
                className="px-8 bg-blue-600 hover:bg-blue-500 text-white font-black skew-x-[-6deg] transition-all hover:shadow-[0_0_20px_rgba(37,99,235,0.4)]"
              >
                JOIN
              </button>
            </div>
          </div>
        </div>
        {error && <div className="mt-12 text-center font-mono text-red-500 max-w-xl mx-auto border-b border-red-500 pb-2">{error}</div>}
      </div>
    )
  }

  // GAME BOARD
  return (
    <div className="min-h-screen bg-black text-slate-200 font-sans selection:bg-yellow-500/50">

      {/* Victory Overlay */}
      {gameState.winner > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="relative p-20 text-center border-y-8 border-white bg-gradient-to-r from-transparent via-slate-900 to-transparent w-full">
            <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/diagmonds-light.png')] opacity-10"></div>

            {gameState.winner === 3 ? (
                <>
                    <ShieldAlert size={80} className="mx-auto text-red-600 animate-pulse mb-8" />
                    <h2 className="text-8xl font-black mb-4 uppercase tracking-tighter italic text-red-600 drop-shadow-[0_0_50px_red]">
                        ZONE DESTROYED
                    </h2>
                    <h3 className="text-2xl font-mono text-white mb-12 tracking-[1em] uppercase animate-pulse">Evacuating...</h3>
                </>
            ) : (
                <>
                    <h2 className={`text-9xl font-black mb-4 uppercase tracking-tighter italic drop-shadow-[0_0_50px_currentColor] ${gameState.winner === TEAM_RED ? 'text-red-600' : 'text-blue-600'}`}>
                        {gameState.winner === TEAM_RED ? 'RED WIN' : 'BLUE WIN'}
                    </h2>
                    <h3 className="text-2xl font-mono text-white mb-12 tracking-[1em] uppercase">Domination Complete</h3>

                    {myTeam === gameState.winner && (
                    <div className="mb-12 inline-flex items-center space-x-4 px-8 py-4 bg-green-500/20 border border-green-500 text-green-400 rounded-full animate-pulse">
                        <Award size={24} /> 
                        <span className="font-bold font-mono">BOUNTY TRANSFERRED TO WALLET</span>
                    </div>
                    )}
                </>
            )}

            <div>
              <button
                onClick={leaveLobby}
                className="px-12 py-4 bg-white text-black hover:bg-slate-200 font-black text-xl uppercase tracking-widest transition-colors"
              >
                Exit Battle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex justify-between items-center px-6 sticky top-0 z-30 shadow-2xl">
        <div className="flex items-center space-x-6">
          <button onClick={leaveLobby} className="flex items-center group">
            <div className="p-2 bg-slate-800 group-hover:bg-red-600 transition-colors rounded-lg mr-3">
              <Home size={20} className="text-slate-400 group-hover:text-white" />
            </div>
            <span className="text-xs font-mono font-bold text-slate-500 group-hover:text-red-500 transition-colors uppercase tracking-widest hidden sm:block">
              LEAVE ZONE
            </span>
          </button>

          <div className="h-8 w-px bg-slate-800 mx-4"></div>

          <div className="flex flex-col">
            <span className="text-[10px] uppercase text-slate-500 font-bold tracking-widest">Zone Code</span>
            <span className="text-xl font-black text-white italic leading-none tracking-widest">#{gameState.gameId}</span>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-black/50 px-6 py-2 rounded-full border border-slate-800">
          <Coins size={16} className="text-yellow-500" />
          <span className="text-yellow-500 font-mono font-bold tabular-nums">{gameState.prizePool} QUAI</span>
        </div>

        <div className="flex items-center space-x-4">
          {account && <div className="text-xs font-mono text-slate-600 hidden sm:block">{account.substring(0, 6)}...</div>}
           <button 
              onClick={abortGame} 
              className="text-red-900 hover:text-red-500 border border-red-900/50 hover:border-red-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest transition-colors mr-2"
           >
              RESET
           </button>
          <button onClick={() => fetchGameState(contract, account, currentGameId)} className="hover:rotate-180 transition-transform duration-500 text-slate-500 hover:text-white">
            <RefreshCw size={20} />
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-7xl">

        {/* SCOREBOARD / AP BARS */}
        {gameState.active && (
          <div className="mb-12 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl relative overflow-hidden">

            {/* Turn Indicator */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 text-center pt-2">
              <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${isRedTurn ? 'border-red-500 text-red-500 bg-red-950' : 'border-blue-500 text-blue-500 bg-blue-950'}`}>
                {isRedTurn ? 'Defcon Red' : 'Defcon Blue'}
              </span>
            </div>

            <div className="flex items-center justify-between gap-8 mt-4">
              {/* RED TEAM */}
              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                  <h3 className="text-3xl font-black italic text-red-600 tracking-tighter">RED</h3>
                  <div className="text-right">
                    <div className="text-4xl font-black text-white leading-none tabular-nums">{gameState.ap1}</div>
                    <div className="text-[10px] text-red-400 font-mono uppercase">Annihilation Pts</div>
                  </div>
                </div>
                <div className="h-4 bg-black rounded-full overflow-hidden border border-slate-800 relative">
                  {/* Target Marker */}
                  <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/20 z-10"></div>
                  <div className="h-full bg-gradient-to-r from-red-900 to-red-600 transition-all duration-700 ease-out relative" style={{ width: `${Math.min(gameState.ap1, 100)}%` }}>
                    <div className="absolute right-0 top-0 bottom-0 w-1 bg-white animate-pulse shadow-[0_0_10px_white]"></div>
                  </div>
                </div>
                <div className="mt-2 text-xs font-mono text-slate-500">
                  <span>CARDS: {gameState.cards1}</span>
                </div>
              </div>

              <div className="text-slate-700 font-black text-2xl italic">VS</div>

              {/* BLUE TEAM */}
              <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                  <div className="text-left">
                    <div className="text-4xl font-black text-white leading-none tabular-nums">{gameState.ap2}</div>
                    <div className="text-[10px] text-blue-400 font-mono uppercase">Annihilation Pts</div>
                  </div>
                  <h3 className="text-3xl font-black italic text-blue-600 tracking-tighter">BLUE</h3>
                </div>
                <div className="h-4 bg-black rounded-full overflow-hidden border border-slate-800 relative">
                  <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-white/20 z-10"></div>
                  <div className="h-full bg-gradient-to-l from-blue-900 to-blue-600 transition-all duration-700 ease-out ml-auto relative" style={{ width: `${Math.min(gameState.ap2, 100)}%` }}>
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-white animate-pulse shadow-[0_0_10px_white]"></div>
                  </div>
                </div>
                <div className="mt-2 text-right text-xs font-mono text-slate-500">
                  <span>CARDS: {gameState.cards2}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STATUS BAR */}
        {gameState.active && (
            <div className="mb-12 flex justify-center animate-in fade-in duration-500">
                {loading ? (
                    <div className="bg-yellow-500/10 border border-yellow-500 text-yellow-500 px-8 py-4 font-mono font-bold uppercase tracking-widest animate-pulse flex items-center shadow-[0_0_20px_rgba(234,179,8,0.2)]">
                        <RefreshCw className="animate-spin mr-4" size={24}/>
                        PROCESSING TRANSACTION...
                    </div>
                ) : (
                    <div className={`px-10 py-4 font-mono font-bold uppercase tracking-widest border flex items-center shadow-2xl transition-all duration-500
                        ${isMyTurn ? 'bg-green-500/20 border-green-500 text-green-400 scale-105 shadow-[0_0_30px_rgba(74,222,128,0.2)]' : 
                          isRedTurn ? 'bg-red-950/40 border-red-900 text-red-600 opacity-80' : 
                          'bg-blue-950/40 border-blue-900 text-blue-600 opacity-80'}
                    `}>
                        {isMyTurn ? (
                             <>YOUR TURN - DEPLOY CARDS</>
                        ) : (
                             <>{isRedTurn ? 'RED' : 'BLUE'} FACTION CHOOSING...</>
                        )}
                    </div>
                )}
            </div>
        )}

        {/* TEAM SELECTION */}
        {myTeam === 0 && !gameState.winner && (
          <div className="grid md:grid-cols-2 gap-8 py-8">
            <div className="group relative bg-black border border-red-900/30 hover:border-red-500 p-12 flex flex-col items-center transition-all overflow-hidden hover:bg-red-950/10">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-red-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
              <h3 className="text-5xl font-black text-red-600 mb-2 italic">RED FACTION</h3>
              <p className="text-red-400/50 mb-8 font-mono">{gameState.count1} OPERATIVES</p>
              <button onClick={() => joinTeam(TEAM_RED)} disabled={loading} className="px-10 py-4 bg-red-600 text-white font-black uppercase tracking-widest hover:bg-red-500 transition-colors w-full">
                Join / 0.0067 QUAI
              </button>
            </div>

            <div className="group relative bg-black border border-blue-900/30 hover:border-blue-500 p-12 flex flex-col items-center transition-all overflow-hidden hover:bg-blue-950/10">
              <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-600 scale-x-0 group-hover:scale-x-100 transition-transform duration-500"></div>
              <h3 className="text-5xl font-black text-blue-600 mb-2 italic">BLUE FACTION</h3>
              <p className="text-blue-400/50 mb-8 font-mono">{gameState.count2} OPERATIVES</p>
              <button onClick={() => joinTeam(TEAM_BLUE)} disabled={loading} className="px-10 py-4 bg-blue-600 text-white font-black uppercase tracking-widest hover:bg-blue-500 transition-colors w-full">
                Join / 0.0067 QUAI
              </button>
            </div>
          </div>
        )}

        {/* WAITING ROOM */}
        {myTeam !== 0 && !gameState.active && !gameState.winner && (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="mb-12 flex items-baseline space-x-4">
              <span className="text-6xl font-black text-white">{gameState.count1}</span>
              <span className="text-slate-600 font-black text-2xl">VS</span>
              <span className="text-6xl font-black text-white">{gameState.count2}</span>
            </div>

            {gameState.count1 > 0 && gameState.count2 > 0 ? (
              <button
                onClick={beginGame}
                disabled={loading}
                className="px-16 py-6 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-3xl uppercase tracking-tighter skew-x-[-10deg] hover:skew-x-[-15deg] transition-all shadow-[0_0_50px_rgba(234,179,8,0.4)]"
              >
                INITIATE COMBAT
              </button>
            ) : (
              <div className="text-slate-500 font-mono animate-pulse">Waiting for opponents...</div>
            )}
          </div>
        )}

        {/* HAND */}
        {gameState.active && myTeam !== 0 && (
          <div className="mt-12">
            <h3 className="text-center text-slate-600 font-mono text-xs uppercase tracking-[0.5em] mb-8">Your Cards</h3>

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


          </div>
        )}

      </main>
    </div>
  );
}

export default App;
