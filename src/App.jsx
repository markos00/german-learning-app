import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, BookOpen, Volume2, ArrowRight, History, RotateCcw, Sparkles, X, 
  Globe, ChevronDown, Loader2, Image as ImageIcon, Mic, Brain, Layers, 
  Download, Check, Play, Plus, Trash2, Camera, MessageCircle, PenTool, 
  Scissors, Ear, Trophy, Grid, Zap, Eye, AlertCircle, MoreHorizontal,
  FileJson, Upload, Settings, Coffee, GraduationCap, RefreshCw, MicOff,
  BarChart, List, Library as LibraryIcon, ChevronLeft, ChevronRight, Repeat,
  Cloud, CloudOff
} from 'lucide-react';

// --- FIREBASE IMPORTS (FIXED) ---
// We now use standard imports which fixes the "Dynamic require" error
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, collection, onSnapshot, deleteDoc, updateDoc } from 'firebase/firestore';

// --- CONFIGURATION SECTION ---

// 1. PASTE YOUR FIREBASE CONFIG HERE FOR PUBLIC DEPLOYMENT
// (You get this from the Firebase Console -> Project Settings)
const firebaseConfig = {
  apiKey: "AIzaSyBP17KTNmHCn_3QXy4zVgiWqG9CARJGzm4",
  authDomain: "german-master-app.firebaseapp.com",
  projectId: "german-master-app",
  storageBucket: "german-master-app.firebasestorage.app",
  messagingSenderId: "251272830350",
  appId: "1:251272830350:web:44f14274ec3462c6b318df",
  measurementId: "G-RNTFZFENTR"
};

// 2. Gemini API Key (Ideally use an Environment Variable in Vercel)
// If deploying locally, paste your key inside the quotes: ""
const apiKey = ""; 

// --- APP INITIALIZATION ---

// This logic automatically switches between the AI Preview environment 
// and your Public Deployment configuration.
let app, auth, db, appId;

try {
  // Check if we are running in the AI Preview Environment
  const isAIEnv = typeof __firebase_config !== 'undefined';
  const configToUse = isAIEnv ? JSON.parse(__firebase_config) : myFirebaseConfig;
  
  appId = isAIEnv && typeof __app_id !== 'undefined' ? __app_id : 'german-app-public';
  
  // Initialize Firebase
  app = initializeApp(configToUse);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase Init Error: Did you paste your config in line 25?", e);
}

// --- UTILITIES ---

const parseJSON = (text) => {
  try {
    return JSON.parse(text);
  } catch (e) {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) return JSON.parse(arrayMatch[0]);
    throw new Error("Invalid JSON format from AI");
  }
};

const fetchGemini = async (prompt) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
      }
    );
    if (!response.ok) throw new Error("API Error");
    const data = await response.json();
    return data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error(error);
    throw new Error("AI Service Failed");
  }
};

const fetchGeminiJSON = async (prompt) => {
  const text = await fetchGemini(prompt + " \nReturn ONLY valid JSON. No markdown.");
  const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();
  return parseJSON(cleanText);
};

const pcmToWav = (base64, sampleRate = 24000) => {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const pcmData = bytes.buffer;
  const wavHeader = new ArrayBuffer(44);
  const view = new DataView(wavHeader);
  const writeString = (view, offset, string) => {
    for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
  };
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + pcmData.byteLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); 
  view.setUint16(20, 1, true); 
  view.setUint16(22, 1, true); 
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); 
  view.setUint16(34, 16, true); 
  writeString(view, 36, 'data');
  view.setUint32(40, pcmData.byteLength, true);
  return new Blob([wavHeader, pcmData], { type: 'audio/wav' });
};

const fetchGeminiTTS = async (text) => {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: text }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
          }
        }),
      }
    );
    if (!response.ok) throw new Error("TTS API Error");
    const data = await response.json();
    const inlineData = data.candidates[0].content.parts[0].inlineData;
    let sampleRate = 24000;
    if (inlineData.mimeType.includes("rate=")) {
      sampleRate = parseInt(inlineData.mimeType.split("rate=")[1]);
    }
    return pcmToWav(inlineData.data, sampleRate);
  } catch (error) {
    console.error("TTS Failed", error);
    return null;
  }
};

// --- HELPER COMPONENTS ---

const AudioButton = ({ text, className = "", autoPlay = false }) => {
  const [loading, setLoading] = useState(false);

  const speak = async (e) => {
    e?.stopPropagation();
    if (!text) return;
    setLoading(true);
    const wavBlob = await fetchGeminiTTS(text);
    if (wavBlob) {
      const audioUrl = URL.createObjectURL(wavBlob);
      const audio = new Audio(audioUrl);
      audio.play();
      audio.onended = () => URL.revokeObjectURL(audioUrl);
    } else {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'de-DE';
      window.speechSynthesis.speak(utterance);
    }
    setLoading(false);
  };

  useEffect(() => { if (autoPlay) speak(); }, [autoPlay, text]);

  return (
    <button onClick={speak} disabled={loading} className={`p-2 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors ${className}`}>
      {loading ? <Loader2 size={18} className="animate-spin" /> : <Volume2 size={18} />}
    </button>
  );
};

// --- SUB-COMPONENTS ---

const Library = ({ history, user, onDelete, onStudy }) => {
  const [search, setSearch] = useState('');
  const filtered = history.filter(h => (h.word && h.word.toLowerCase().includes(search.toLowerCase())));

  const getGenderColor = (g) => {
      if (!g) return 'bg-slate-100 text-slate-500';
      const gender = g.toLowerCase();
      if (gender === 'der') return 'bg-blue-100 text-blue-700';
      if (gender === 'die') return 'bg-rose-100 text-rose-700';
      if (gender === 'das') return 'bg-emerald-100 text-emerald-700';
      return 'bg-slate-100 text-slate-500';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="flex items-center gap-2">
                <LibraryIcon className="text-indigo-600"/>
                <h2 className="text-xl font-bold text-slate-800">Library</h2>
                <span className="text-sm font-bold bg-white px-2 py-1 rounded text-slate-500 border border-slate-200">{history.length}</span>
            </div>
            <div className="relative w-full md:w-auto">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                <input type="text" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm w-full md:w-64 focus:outline-none focus:ring-2 focus:ring-indigo-100"/>
            </div>
        </div>

        {history.length === 0 ? (
             <div className="p-12 text-center text-slate-400"><BookOpen size={48} className="mx-auto mb-4 opacity-20"/><p>Library empty. Start analyzing!</p></div>
        ) : (
            <div className="max-h-[600px] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-100 sticky top-0">
                        <tr><th className="px-6 py-3">Word</th><th className="px-6 py-3">Translation</th><th className="px-6 py-3 text-right">Actions</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {filtered.map((item) => (
                            <tr key={item.id || item.word} className="hover:bg-indigo-50/30 transition-colors group">
                                <td className="px-6 py-3">
                                    <div className="flex items-center gap-2">
                                        {item.gender && <span className={`text-[10px] uppercase font-bold px-1.5 rounded ${getGenderColor(item.gender)}`}>{item.gender}</span>}
                                        <span className="font-bold text-slate-800">{item.word}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-3 text-slate-600">{item.translation}</td>
                                <td className="px-6 py-3 text-right">
                                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <AudioButton text={item.word} className="p-1.5 bg-slate-100 hover:bg-indigo-100 text-indigo-600"/>
                                        <button onClick={() => onStudy(item.word)} className="p-1.5 rounded-full bg-slate-100 hover:bg-emerald-100 text-emerald-600"><Search size={14}/></button>
                                        <button onClick={() => onDelete(item.id)} className="p-1.5 rounded-full bg-slate-100 hover:bg-rose-100 text-rose-600"><Trash2 size={14}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        )}
    </div>
  );
};

const Flashcards = ({ history }) => {
    const [queue, setQueue] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFlipped, setIsFlipped] = useState(false);
    const [finished, setFinished] = useState(false);

    const shuffle = () => {
        const shuffled = [...history].sort(() => Math.random() - 0.5);
        setQueue(shuffled);
        setCurrentIndex(0);
        setIsFlipped(false);
        setFinished(false);
    };

    useEffect(() => { if (history.length > 0) shuffle(); }, [history]);

    const handleNext = () => {
        setIsFlipped(false);
        if (currentIndex < queue.length - 1) setTimeout(() => setCurrentIndex(c => c + 1), 150);
        else setFinished(true);
    };

    if (history.length === 0) return <div className="p-12 text-center text-slate-500">Add words to start studying!</div>;
    if (finished) return (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
             <Trophy size={64} className="mx-auto mb-6 text-amber-400"/>
             <h2 className="text-2xl font-bold text-slate-800 mb-2">Session Complete!</h2>
             <button onClick={shuffle} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 mx-auto"><RotateCcw size={20}/> Start Over</button>
        </div>
    );

    const card = queue[currentIndex];
    if (!card) return <Loader2 className="animate-spin mx-auto"/>;

    return (
        <div className="max-w-xl mx-auto">
            <div className="flex justify-between items-center mb-6 text-sm text-slate-500 font-medium uppercase tracking-wider">
                <span>Card {currentIndex + 1} / {queue.length}</span>
                <button onClick={shuffle} className="flex items-center gap-1 hover:text-indigo-600"><RefreshCw size={14}/> Shuffle</button>
            </div>
            
            {/* Card Container with Inline Styles for 3D Flip */}
            <div 
               className="relative h-80 w-full cursor-pointer group"
               style={{ perspective: '1000px' }}
               onClick={() => setIsFlipped(!isFlipped)}
            >
                <div 
                    className="absolute inset-0 w-full h-full duration-500 transition-all"
                    style={{ 
                        transformStyle: 'preserve-3d', 
                        transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' 
                    }}
                >
                    {/* FRONT */}
                    <div 
                        className="absolute inset-0 w-full h-full bg-white rounded-2xl shadow-lg border-2 border-indigo-50 flex flex-col items-center justify-center p-8"
                        style={{ backfaceVisibility: 'hidden' }}
                    >
                        <span className="text-xs font-bold uppercase text-indigo-200 mb-4 tracking-widest">German</span>
                        <h2 className="text-4xl font-bold text-slate-800 text-center">{card.word}</h2>
                        <div className="mt-8 text-slate-400 text-sm flex items-center gap-2 opacity-50 group-hover:opacity-100"><Eye size={16}/> Click to flip</div>
                    </div>

                    {/* BACK */}
                    <div 
                        className="absolute inset-0 w-full h-full bg-indigo-600 rounded-2xl shadow-lg flex flex-col items-center justify-center p-8 text-white"
                        style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                    >
                        <div className="absolute top-4 right-4" onClick={e => e.stopPropagation()}><AudioButton text={card.word} className="bg-white/20 hover:bg-white/30 text-white"/></div>
                        {card.gender && <span className="px-2 py-1 bg-black/20 rounded text-xs font-bold uppercase mb-4">{card.gender}</span>}
                        <h2 className="text-3xl font-bold mb-2 text-center">{card.translation}</h2>
                        {card.exampleSentence?.german && <p className="text-center text-indigo-100 text-sm italic opacity-90 mt-4">"{card.exampleSentence.german}"</p>}
                    </div>
                </div>
            </div>
            
            <div className="flex justify-center gap-4 mt-8">
                <button onClick={() => {setIsFlipped(false); if(currentIndex>0) setTimeout(()=>setCurrentIndex(c=>c-1),150)}} disabled={currentIndex===0} className="p-4 rounded-full bg-white border border-slate-200 text-slate-600 disabled:opacity-50"><ChevronLeft size={24}/></button>
                <button onClick={handleNext} className="p-4 rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-200"><ChevronRight size={24}/></button>
            </div>
        </div>
    );
};

const DailyReview = ({ history, onUpdateReview, onComplete }) => {
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const now = Date.now();
    const due = history.filter(item => !item.nextReview || item.nextReview <= now);
    setQueue(due);
    if (due.length > 0) setCurrent(due[0]);
  }, [history]);

  const handleRate = (rating) => {
    let interval = 0;
    if (rating === 'hard') interval = 600000; 
    else if (rating === 'good') interval = 86400000; 
    else interval = 259200000;
    
    onUpdateReview(current.id, Date.now() + interval);

    const nextQueue = queue.slice(1);
    setQueue(nextQueue);
    if (nextQueue.length > 0) {
      setCurrent(nextQueue[0]);
      setRevealed(false);
    } else {
      onComplete();
    }
  };

  if (!current) return <div className="text-center py-20 text-slate-500">All done for now!</div>;

  return (
    <div className="max-w-lg mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center min-h-[400px] flex flex-col justify-center">
       <div className="text-sm text-slate-400 mb-8 uppercase tracking-widest">Daily Review • {queue.length} remaining</div>
       <div className="mb-8">
         <h2 className="text-4xl font-bold text-slate-900 mb-2">{current.word}</h2>
         {revealed && (
            <div className="animate-in fade-in slide-in-from-bottom-2">
               <p className="text-2xl text-indigo-600 font-medium mb-2">{current.translation}</p>
               <div className="flex justify-center gap-2 mb-4">
                 <span className="bg-slate-100 px-2 py-1 rounded text-sm">{current.gender || current.partOfSpeech}</span>
                 <AudioButton text={current.word} />
               </div>
               <p className="text-slate-500 italic">"{current.exampleSentence?.german}"</p>
            </div>
         )}
       </div>
       {!revealed ? (
          <button onClick={()=>setRevealed(true)} className="bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700">Show Answer</button>
       ) : (
          <div className="grid grid-cols-3 gap-3">
             <button onClick={()=>handleRate('hard')} className="bg-rose-100 text-rose-700 py-3 rounded-xl font-bold hover:bg-rose-200">Hard</button>
             <button onClick={()=>handleRate('good')} className="bg-amber-100 text-amber-700 py-3 rounded-xl font-bold hover:bg-amber-200">Good</button>
             <button onClick={()=>handleRate('easy')} className="bg-emerald-100 text-emerald-700 py-3 rounded-xl font-bold hover:bg-emerald-200">Easy</button>
          </div>
       )}
    </div>
  );
};

const Analyzer = ({ activeWord, addXP, onSave, level }) => {
  const [query, setQuery] = useState(activeWord || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('grammar');

  useEffect(() => { if (activeWord) { setQuery(activeWord); search(activeWord); } }, [activeWord]);

  const search = async (term) => {
    const q = term || query;
    if (!q) return;
    setLoading(true); setError(null);
    try {
      const prompt = `Analyze German word "${q}". If declined/conjugated, use BASE FORM. If misspelled, correct. Level ${level}. JSON: { "word": "BaseForm", "wasCorrected": boolean, "originalInput": "${q}", "gender": "der/die/das", "translation": "English", "definition": "def", "ipa": "ipa", "partOfSpeech": "noun/verb", "grammar": { "plural": "pl", "declension": {"nominative": ["s","p"], "accusative": ["s","p"], "dative": ["s","p"], "genitive": ["s","p"]}, "conjugation": {"present": ["ich","du","er","wir","ihr","sie"]} }, "exampleSentence": {"german": "de", "translation": "en"} }`;
      const res = await fetchGeminiJSON(prompt);
      const processed = { ...res, nextReview: Date.now(), lastReviewed: 0, id: crypto.randomUUID() };
      setData(processed);
      if (res.wasCorrected) setQuery(res.word);
      onSave(processed); // Save to DB
      addXP(5);
    } catch (e) { setError("Analysis failed."); }
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-slate-200 min-h-[600px] p-6">
      <div className="flex gap-2 mb-6">
        <input value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter' && search()} className="flex-1 p-3 border rounded-xl bg-slate-50 text-lg" placeholder="Word to analyze..."/>
        <button onClick={()=>search()} disabled={loading} className="bg-indigo-600 text-white px-6 rounded-xl"><Search/></button>
      </div>
      {loading && <div className="py-20 text-center"><Loader2 className="animate-spin mx-auto w-10 h-10 text-indigo-600"/></div>}
      {error && <div className="py-10 text-center text-rose-500"><AlertCircle className="mx-auto mb-2"/><p>{error}</p></div>}
      {data && !loading && (
        <div className="animate-in fade-in">
          {data.wasCorrected && <div className="mb-4 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg text-sm flex items-center gap-2"><Sparkles size={14}/><span>Corrected from <strong>{data.originalInput}</strong></span></div>}
          <div className="flex justify-between items-start mb-6">
            <div>
              {data.gender && <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-indigo-100 text-indigo-700">{data.gender}</span>}
              <h1 className="text-4xl font-bold text-slate-900">{data.word}</h1>
              <div className="text-slate-500 font-mono">{data.ipa} • {data.partOfSpeech}</div>
            </div>
            <AudioButton text={data.word} className="bg-indigo-100 text-indigo-600 p-3"/>
          </div>
          <div className="text-2xl font-medium text-indigo-900 mb-1">{data.translation}</div>
          <p className="text-slate-500 mb-8">{data.definition}</p>
          <div className="flex border-b mb-6">
             <button onClick={()=>setTab('grammar')} className={`px-6 py-2 border-b-2 ${tab==='grammar'?'border-indigo-600 text-indigo-600':'border-transparent'}`}>Grammar</button>
             <button onClick={()=>setTab('examples')} className={`px-6 py-2 border-b-2 ${tab==='examples'?'border-indigo-600 text-indigo-600':'border-transparent'}`}>Examples</button>
          </div>
          {tab === 'grammar' && data.partOfSpeech === 'noun' && (
             <div className="overflow-x-auto">
               <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50"><tr><th className="px-4 py-2">Case</th><th className="px-4 py-2">Singular</th><th className="px-4 py-2">Plural</th></tr></thead>
                  <tbody>
                    {['nominative','accusative','dative','genitive'].map(c => (
                      <tr key={c} className="border-b">
                        <td className="px-4 py-2 font-medium capitalize">{c}</td>
                        <td className="px-4 py-2">{data.grammar?.declension?.[c]?.[0] || '-'}</td>
                        <td className="px-4 py-2">{data.grammar?.declension?.[c]?.[1] || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>
          )}
           {tab === 'grammar' && data.partOfSpeech === 'verb' && (
            <div className="grid grid-cols-2 gap-2">
               {data.grammar?.conjugation?.present?.map((v, i) => <div key={i} className="bg-slate-50 p-2 rounded border border-slate-100 text-sm">{v}</div>)}
            </div>
          )}
          {tab === 'examples' && (
            <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100">
               <div className="text-lg font-medium text-indigo-900">"{data.exampleSentence?.german}"</div>
               <div className="text-indigo-600/70 mt-1">{data.exampleSentence?.translation}</div>
               <div className="mt-3 flex justify-end"><AudioButton text={data.exampleSentence?.german}/></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Deconstructor = ({ addXP }) => {
  const [input, setInput] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const analyze = async () => {
    if (!input) return;
    setLoading(true);
    try {
      const prompt = `Break down the German compound word "${input}". Return JSON: { "parts": [{"german": "root", "english": "meaning", "type": "noun/adj"}], "meaning": "full meaning" }`;
      const res = await fetchGeminiJSON(prompt);
      setData(res);
      addXP(20);
    } catch (e) { alert(e.message); }
    setLoading(false);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Scissors className="text-indigo-600"/> Word Deconstructor</h2>
      <div className="flex gap-2 mb-6">
        <input value={input} onChange={e=>setInput(e.target.value)} placeholder="e.g. Kühlschrank" className="flex-1 p-3 border rounded-xl bg-slate-50"/>
        <button onClick={analyze} disabled={loading} className="bg-indigo-600 text-white px-6 rounded-xl font-bold">
          {loading ? <Loader2 className="animate-spin"/> : "Cut"}
        </button>
      </div>
      {data && (
        <div className="space-y-4 animate-in fade-in">
          <div className="text-center mb-6">
            <div className="text-3xl font-bold text-slate-800">{input}</div>
            <div className="text-indigo-600 font-medium">{data.meaning}</div>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {data.parts.map((part, i) => (
              <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center min-w-[100px]">
                <div className="font-bold text-lg text-slate-800">{part.german}</div>
                <div className="text-xs uppercase tracking-wider text-slate-400">{part.type}</div>
                <div className="text-sm text-indigo-600 mt-1">{part.english}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ReaderMode = ({ onSelectWord, level }) => {
  const [text, setText] = useState('');
  const [mode, setMode] = useState('edit'); 
  const [popup, setPopup] = useState(null); 
  const [simplifying, setSimplifying] = useState(false);

  const handleWordClick = async (word) => {
    const clean = word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"");
    if (clean.length <= 1) return;
    setPopup({ word: clean, loading: true });
    try {
      const prompt = `Analyze brief German word "${clean}". JSON: {"word": "${clean}", "gender": "der/die/das", "translation": "English", "type": "noun/etc"}`;
      const data = await fetchGeminiJSON(prompt);
      setPopup({ word: clean, data: data, loading: false });
    } catch (e) { setPopup(null); }
  };

  const simplifyText = async () => {
    if (!text) return;
    setSimplifying(true);
    try {
      const prompt = `Rewrite the following German text to ${level} level for a learner. Simplify grammar and vocabulary but keep the meaning. Text: "${text}"`;
      const simplified = await fetchGemini(prompt);
      setText(simplified);
    } catch(e) { alert("Simplification failed"); }
    setSimplifying(false);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 min-h-[500px] relative">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold flex items-center gap-2"><BookOpen className="text-emerald-600"/> Reader Mode</h2>
        <div className="flex gap-2">
           {mode === 'read' && (
             <button onClick={simplifyText} disabled={simplifying} className="text-sm bg-amber-50 text-amber-700 px-3 py-1 rounded-lg font-medium flex items-center gap-1 hover:bg-amber-100">
                {simplifying ? <Loader2 className="animate-spin" size={14}/> : <Sparkles size={14}/>} Simplify to {level}
             </button>
           )}
           <button onClick={()=>setMode(mode==='edit'?'read':'edit')} className="text-sm bg-slate-100 px-3 py-1 rounded-lg font-medium">
             {mode === 'edit' ? 'Start Reading' : 'Edit Text'}
           </button>
        </div>
      </div>
      
      {mode === 'edit' ? (
        <textarea 
          value={text} 
          onChange={e=>setText(e.target.value)} 
          placeholder="Paste a German article or story here..." 
          className="w-full h-[400px] p-4 border border-slate-200 rounded-xl bg-slate-50 resize-none focus:ring-2 focus:ring-emerald-100 outline-none"
        />
      ) : (
        <div className="relative">
          <div className="prose max-w-none text-lg leading-relaxed">
            {text.split(/\s+/).map((word, i) => (
              <span key={i} onClick={() => handleWordClick(word)} className={`cursor-pointer rounded px-1 transition-colors inline-block ${popup?.word === word.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g,"") ? 'bg-indigo-100 text-indigo-900' : 'hover:bg-emerald-100 hover:text-emerald-800'}`}>{word}{' '}</span>
            ))}
          </div>
          {popup && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 w-64 bg-slate-900 text-white p-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom-4 fade-in">
              <button onClick={()=>setPopup(null)} className="absolute top-2 right-2 text-slate-400 hover:text-white"><X size={14}/></button>
              {popup.loading ? (
                 <div className="flex items-center justify-center gap-2 py-2"><Loader2 size={16} className="animate-spin"/><span className="text-sm">Analyzing...</span></div>
              ) : (
                 <div>
                    <div className="flex items-center gap-2 mb-1">
                       {popup.data.gender && <span className="text-xs font-bold bg-white/20 px-1.5 py-0.5 rounded uppercase text-amber-300">{popup.data.gender}</span>}
                       <span className="font-bold text-lg">{popup.data.word}</span>
                    </div>
                    <div className="text-emerald-400 font-medium">{popup.data.translation}</div>
                    <div className="text-xs text-slate-400 mt-2 flex items-center justify-between">
                       <span>{popup.data.type}</span>
                       <AudioButton text={popup.data.word} className="text-slate-300 hover:text-white bg-white/10" />
                    </div>
                    <button onClick={() => onSelectWord(popup.data.word)} className="w-full mt-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold">Full Analysis</button>
                 </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const Roleplay = ({ addXP, level }) => {
  const [persona, setPersona] = useState('Barista');
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const startChat = () => {
    setMessages([{ role: 'ai', text: `Hallo! Was darf es heute sein? (Role: ${persona})` }]);
  };

  const send = async (text = input) => {
    if (!text) return;
    const userMsg = { role: 'user', text: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    
    const history = messages.map(m => `${m.role}: ${m.text}`).join('\n');
    const prompt = `Roleplay scenario: You are a ${persona} in Germany. The user is a customer. 
    Level: The user is at CEFR Level ${level}. Adjust your vocabulary and grammar complexity to match ${level}.
    History:\n${history}\nUser: ${text}\n
    Reply in German naturally. Keep it short (1-2 sentences). Then, in brackets [], provide a correction if the user made a grammar mistake.`;

    try {
      const reply = await fetchGemini(prompt);
      setMessages(prev => [...prev, { role: 'ai', text: reply }]);
      addXP(15);
      if (voiceMode) {
        const spokenText = reply.split('[')[0].trim();
        const wavBlob = await fetchGeminiTTS(spokenText);
        if (wavBlob) {
            const audio = new Audio(URL.createObjectURL(wavBlob));
            audio.play();
        }
      }
    } catch (e) { alert("Chat Error"); }
    setLoading(false);
  };

  const toggleVoice = () => {
    if (!('webkitSpeechRecognition' in window)) {
        alert("Browser does not support speech recognition");
        return;
    }
    setVoiceMode(!voiceMode);
  };

  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.interimResults = false;
    
    setIsListening(true);
    recognition.start();

    recognition.onresult = (event) => {
      const heard = event.results[0][0].transcript;
      send(heard);
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
  };

  useEffect(() => { if (messages.length===0) startChat(); }, [persona]);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden h-[600px] flex flex-col">
      <div className="p-4 border-b bg-slate-50 flex justify-between items-center">
        <h2 className="font-bold flex items-center gap-2"><MessageCircle className="text-blue-500"/> Roleplay (Level {level})</h2>
        <div className="flex items-center gap-2">
            <button onClick={toggleVoice} className={`p-2 rounded-lg ${voiceMode ? 'bg-red-100 text-red-600' : 'bg-slate-200 text-slate-600'}`}>
                {voiceMode ? <Mic size={16}/> : <MicOff size={16}/>}
            </button>
            <select value={persona} onChange={e=>{setPersona(e.target.value); setMessages([])}} className="text-sm p-1 rounded bg-white border">
                <option>Barista</option>
                <option>Doctor</option>
                <option>Conductor</option>
            </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'}`}>
             {m.role === 'ai' && (
                 <div className="mr-2 mt-1"><AudioButton text={m.text.split('[')[0]} className="w-8 h-8 bg-slate-100" /></div>
             )}
            <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${m.role==='user'?'bg-blue-600 text-white rounded-br-none':'bg-slate-100 text-slate-800 rounded-bl-none'}`}>
              {m.text.split('[').map((part, idx) => (
                 idx === 0 ? part : <span key={idx} className="block mt-2 text-xs bg-black/10 p-1 rounded text-amber-200">Correction: {part.replace(']', '')}</span>
              ))}
            </div>
          </div>
        ))}
        {loading && <div className="text-xs text-slate-400 p-2 animate-pulse">AI is typing...</div>}
      </div>
      <div className="p-4 border-t flex gap-2 items-center">
        {voiceMode ? (
            <button onClick={startListening} className={`w-full py-4 rounded-xl font-bold flex items-center justify-center gap-2 ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-blue-600 text-white'}`}>
                <Mic size={20}/> {isListening ? 'Listening...' : 'Tap to Speak'}
            </button>
        ) : (
            <>
                <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Type response..." className="flex-1 bg-slate-50 border rounded-xl px-4 py-2"/>
                <button onClick={()=>send()} className="bg-blue-600 text-white p-2 rounded-xl"><ArrowRight/></button>
            </>
        )}
      </div>
    </div>
  );
};

const SentenceBuilder = ({ addXP, level }) => {
  const [game, setGame] = useState(null);
  const [userOrder, setUserOrder] = useState([]);
  const [status, setStatus] = useState(null); 

  const loadGame = async () => {
    const res = await fetchGeminiJSON(`Generate a German sentence appropriate for CEFR Level ${level}. Return JSON: {"sentence": "German sentence", "translation": "English translation", "parts": ["shuffled", "array", "of", "words"]}`);
    const shuffled = [...res.parts].sort(() => Math.random() - 0.5);
    setGame({ ...res, parts: shuffled });
    setUserOrder([]);
    setStatus(null);
  };

  const check = () => {
    const attempt = userOrder.join(' ');
    if (attempt.replace(/[.,]/g,'') === game.sentence.replace(/[.,]/g,'')) {
      setStatus('success');
      addXP(50);
    } else {
      setStatus('fail');
    }
  };

  useEffect(() => { loadGame(); }, [level]);

  if (!game) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto"/></div>;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200">
      <h2 className="font-bold mb-6 flex items-center gap-2"><Grid className="text-orange-500"/> Sentence Builder ({level})</h2>
      <p className="text-slate-500 mb-4">Translate: <span className="font-medium text-slate-800">{game.translation}</span></p>
      <div className="min-h-[60px] border-2 border-dashed border-slate-200 rounded-xl p-4 mb-6 flex flex-wrap gap-2 bg-slate-50/50">
        {userOrder.map((word, i) => (
          <button key={i} onClick={() => {setUserOrder(userOrder.filter((_, idx) => idx !== i)); setGame(g => ({...g, parts: [...g.parts, word]}));}} className="bg-white border border-slate-300 px-3 py-2 rounded-lg shadow-sm font-medium text-slate-700 hover:bg-red-50">{word}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-8">
        {game.parts.map((word, i) => (
          <button key={i} onClick={() => {setGame(g => ({...g, parts: g.parts.filter((_, idx) => idx !== i)})); setUserOrder([...userOrder, word]);}} className="bg-indigo-50 text-indigo-700 px-3 py-2 rounded-lg font-medium hover:bg-indigo-100">{word}</button>
        ))}
      </div>
      {status === 'success' && <div className="bg-green-100 text-green-800 p-4 rounded-xl mb-4 text-center font-bold">Correct! +50 XP</div>}
      <div className="flex gap-2">
        <button onClick={check} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold">Check</button>
        <button onClick={loadGame} className="bg-slate-100 text-slate-600 p-3 rounded-xl"><RotateCcw/></button>
      </div>
    </div>
  );
};

const Dojo = ({ addXP, level }) => {
  const [card, setCard] = useState(null);
  const [streak, setStreak] = useState(0);
  const [status, setStatus] = useState(null);
  const nextCard = async () => {
    setCard(null); setStatus(null);
    try {
        const seed = Math.floor(Math.random() * 10000);
        const res = await fetchGeminiJSON(`Generate random German noun (Level ${level}). Return noun ONLY (no article). Seed: ${seed}. JSON: {"word": "Noun", "gender": "der/die/das"}`);
        if (res && res.word) res.word = res.word.replace(/^(der|die|das)\s+/i, '').trim();
        setCard(res);
    } catch(e) { }
  };
  const guess = (gender) => {
    if (!card) return;
    if (card.gender.toLowerCase().trim() === gender.toLowerCase().trim()) {
      setStreak(s => s + 1); addXP(10); setStatus('correct'); setTimeout(nextCard, 800);
    } else {
      setStreak(0); setStatus('wrong'); setTimeout(nextCard, 1500);
    }
  };
  useEffect(() => { nextCard(); }, [level]);
  if (!card) return <div className="p-10 text-center"><Loader2 className="animate-spin mx-auto"/></div>;
  return (
    <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md mx-auto">
      <h2 className="text-sm font-bold uppercase text-slate-400 tracking-widest mb-6">Gender Dojo ({level})</h2>
      <div className="mb-12"><div className="text-6xl font-black text-slate-900">{card.word}</div>{status === 'correct' && <div className="text-emerald-600 font-bold mt-2">Richtig!</div>}{status === 'wrong' && <div className="text-rose-600 font-bold mt-2">Wrong! {card.gender}</div>}</div>
      <div className="grid grid-cols-3 gap-4 mb-8">
        <button onClick={()=>guess('der')} className="bg-blue-100 text-blue-700 py-4 rounded-xl font-bold hover:scale-105">DER</button>
        <button onClick={()=>guess('das')} className="bg-emerald-100 text-emerald-700 py-4 rounded-xl font-bold hover:scale-105 mt-[-20px]">DAS</button>
        <button onClick={()=>guess('die')} className="bg-rose-100 text-rose-700 py-4 rounded-xl font-bold hover:scale-105">DIE</button>
      </div>
      <div className="text-slate-500">Streak: <span className="text-indigo-600 font-bold">{streak}</span></div>
    </div>
  );
};

const StarterDecks = ({ onAddWords, level }) => {
    const decks = [{ id: 'verbs', name: 'Essential Verbs', desc: 'Action words' }, { id: 'travel', name: 'Travel', desc: 'Survival' }, { id: 'tech', name: 'Tech', desc: 'Office' }];
    const [loading, setLoading] = useState(null);
    const [message, setMessage] = useState(null);

    const loadDeck = async (deckId) => {
        setLoading(deckId); setMessage(null);
        try {
            const words = await fetchGeminiJSON(`Generate 15 German words for ${deckId} (Level ${level}). JSON array: [{"word": "Wort", "translation": "Word", "gender": "der", "partOfSpeech": "noun"}]`);
            if (Array.isArray(words)) {
                // Process and save
                const processed = words.map(w => ({ ...w, nextReview: Date.now(), lastReviewed: 0, id: crypto.randomUUID() }));
                onAddWords(processed);
                setMessage({ type: 'success', text: `Added ${words.length} words!` });
            }
        } catch(e) { setMessage({ type: 'error', text: "Error loading deck." }); }
        setLoading(null);
    };
    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h2 className="font-bold mb-6 flex items-center gap-2"><Layers className="text-indigo-500"/> Starter Decks ({level})</h2>
            {message && <div className={`mb-4 p-3 rounded-lg text-sm ${message.type==='success'?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{message.text}</div>}
            <div className="grid gap-4">
                {decks.map(d => (<button key={d.id} onClick={() => loadDeck(d.id)} disabled={loading} className="flex items-center p-4 border border-slate-200 rounded-xl hover:bg-indigo-50 text-left"><div className="flex-1"><div className="font-bold">{d.name}</div><div className="text-sm text-slate-500">{d.desc}</div></div>{loading===d.id?<Loader2 className="animate-spin"/>:<Plus/>}</button>))}
            </div>
        </div>
    );
};

const GrammarSurgeon = ({ addXP }) => {
  const [text, setText] = useState('');
  const [diff, setDiff] = useState(null);
  const [loading, setLoading] = useState(false);

  const fix = async () => {
    if (!text) return;
    setLoading(true);
    const prompt = `Correct this German text: "${text}". Return JSON: {"corrected": "full corrected text", "errors": [{"original": "wrong segment", "correction": "right segment", "explanation": "why"}]}`;
    const res = await fetchGeminiJSON(prompt);
    setDiff(res);
    addXP(25);
    setLoading(false);
  };

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 h-full flex flex-col">
      <h2 className="font-bold mb-4 flex items-center gap-2"><PenTool className="text-rose-500"/> Grammar Surgeon</h2>
      
      {!diff ? (
        <>
          <textarea 
            value={text} 
            onChange={e=>setText(e.target.value)} 
            placeholder="Write your German journal entry here..." 
            className="flex-1 p-4 border rounded-xl bg-slate-50 mb-4 resize-none"
          />
          <button onClick={fix} disabled={loading} className="bg-slate-900 text-white py-3 rounded-xl font-bold">
            {loading ? "Operating..." : "Check Grammar"}
          </button>
        </>
      ) : (
        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-emerald-900 text-lg">
            {diff.corrected}
          </div>
          <div className="space-y-3">
            {diff.errors.map((err, i) => (
              <div key={i} className="p-3 bg-white border border-slate-200 rounded-lg shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-rose-500 line-through">{err.original}</span>
                  <ArrowRight size={14} className="text-slate-300"/>
                  <span className="text-emerald-600 font-bold">{err.correction}</span>
                </div>
                <p className="text-xs text-slate-500">{err.explanation}</p>
              </div>
            ))}
          </div>
          <button onClick={()=>setDiff(null)} className="w-full py-3 bg-slate-100 font-bold rounded-xl mt-4">New Entry</button>
        </div>
      )}
    </div>
  );
};

const CultureModule = ({ addXP }) => {
    const [idiom, setIdiom] = useState(null);

    useEffect(() => {
        const fetchIdiom = async () => {
            const data = await fetchGeminiJSON(`Generate a random popular German idiom. JSON: {"german": "phrase", "literal": "literal translation", "meaning": "actual meaning", "context": "when to use"}`);
            setIdiom(data);
            addXP(5);
        };
        fetchIdiom();
    }, []);

    if (!idiom) return <div className="p-10"><Loader2 className="animate-spin mx-auto"/></div>;

    return (
        <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center max-w-md mx-auto">
            <h2 className="font-bold text-amber-600 uppercase tracking-widest mb-6">Culture & Idioms</h2>
            <div className="text-3xl font-black text-slate-900 mb-4">"{idiom.german}"</div>
            <div className="bg-slate-50 p-4 rounded-xl mb-6">
                <div className="text-sm text-slate-400 uppercase mb-1">Literal</div>
                <div className="font-medium text-slate-700">{idiom.literal}</div>
            </div>
            <div className="text-lg text-indigo-900 font-bold mb-2">{idiom.meaning}</div>
            <p className="text-slate-500 italic">{idiom.context}</p>
            <div className="mt-6"><AudioButton text={idiom.german} /></div>
        </div>
    );
};

const SettingsModule = ({ history, setHistory }) => {
    const fileInput = useRef(null);

    const exportData = () => {
        const dataStr = JSON.stringify(history);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', 'german_vocab_backup.json');
        document.body.appendChild(link);
        link.click();
    };

    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                setHistory(data);
                localStorage.setItem('german_history', JSON.stringify(data));
                alert("Import successful!");
            } catch(err) { alert("Invalid file"); }
        };
        reader.readAsText(file);
    };

    return (
        <div className="bg-white p-6 rounded-2xl border border-slate-200">
            <h2 className="font-bold mb-6 flex items-center gap-2"><Settings className="text-slate-500"/> Data Settings</h2>
            <div className="grid grid-cols-2 gap-4">
                <button onClick={exportData} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 hover:border-indigo-300">
                    <Download className="mb-2 text-indigo-600"/>
                    <span className="font-bold text-slate-700">Export JSON</span>
                </button>
                <button onClick={() => fileInput.current.click()} className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-xl hover:bg-slate-50 hover:border-indigo-300">
                    <Upload className="mb-2 text-emerald-600"/>
                    <span className="font-bold text-slate-700">Import JSON</span>
                </button>
                <input type="file" ref={fileInput} onChange={importData} className="hidden" accept=".json"/>
            </div>
            <div className="mt-6 text-center">
                <button onClick={() => { localStorage.clear(); window.location.reload(); }} className="text-rose-500 text-sm font-medium hover:underline">Clear All Data (Reset)</button>
            </div>
        </div>
    );
};

const ListeningLab = ({ addXP, level }) => {
  const [target, setTarget] = useState(null);
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null);

  const loadSentence = async () => {
    const res = await fetchGeminiJSON(`Generate a short German sentence appropriate for CEFR Level ${level}. JSON: {"text": "German text"}`);
    setTarget(res.text);
    setResult(null);
    setInput('');
  };

  const check = () => {
    if (input.toLowerCase().replace(/[.,]/g,'') === target.toLowerCase().replace(/[.,]/g,'')) {
      setResult('correct');
      addXP(30);
    } else {
      setResult('wrong');
    }
  };

  useEffect(() => { loadSentence(); }, [level]);

  if (!target) return <Loader2 className="animate-spin mx-auto mt-10"/>;

  return (
    <div className="bg-white p-6 rounded-2xl border border-slate-200 text-center">
      <h2 className="font-bold mb-6 flex items-center justify-center gap-2"><Ear className="text-cyan-500"/> Dictation ({level})</h2>
      
      <div className="mb-8">
        <div className="flex justify-center mb-2">
           <AudioButton text={target} className="w-20 h-20 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center hover:scale-110 transition-transform shadow-sm" />
        </div>
        <p className="text-sm text-slate-400 mt-2">Click to listen</p>
      </div>

      <input 
        value={input} 
        onChange={e=>setInput(e.target.value)} 
        placeholder="Type what you hear..." 
        className="w-full p-3 border rounded-xl bg-slate-50 text-center text-lg mb-4"
      />

      {result === 'correct' && <div className="text-emerald-600 font-bold mb-4">Correct! "{target}"</div>}
      {result === 'wrong' && <div className="text-rose-600 font-bold mb-4">Wrong. It was: "{target}"</div>}

      {!result ? (
        <button onClick={check} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-bold w-full">Check</button>
      ) : (
        <button onClick={loadSentence} className="bg-slate-800 text-white px-8 py-3 rounded-xl font-bold w-full">Next</button>
      )}
    </div>
  );
};

// --- MAIN APP CONTAINER ---

export default function GermanApp() {
  const [view, setView] = useState('dashboard');
  const [activeWord, setActiveWord] = useState(null); 
  const [user, setUser] = useState(null);
  const [history, setHistory] = useState([]);
  const [xp, setXp] = useState(0);
  const [userLevel, setUserLevel] = useState('A1');
  const [dbStatus, setDbStatus] = useState('disconnected');
  
  // 1. Auth Effect
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, (u) => setUser(u));
  }, []);

  // 2. Data Effect (Sync History & XP)
  useEffect(() => {
    if (!user) return;
    setDbStatus('connected');
    
    // We listen to the 'vocab' collection for this user
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'vocab');
    const unsubVocab = onSnapshot(q, (snapshot) => {
      const words = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(words);
    }, (error) => console.error("Vocab sync error:", error));

    // We listen to a 'stats' doc for XP
    const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'stats', 'main');
    const unsubStats = onSnapshot(statsRef, (doc) => {
      if (doc.exists()) setXp(doc.data().xp || 0);
    });

    return () => { unsubVocab(); unsubStats(); };
  }, [user]);

  // 3. Actions
  const addXP = async (amount) => {
    if (!user) return;
    const newXp = xp + amount;
    setXp(newXp); // Optimistic update
    const statsRef = doc(db, 'artifacts', appId, 'users', user.uid, 'stats', 'main');
    await setDoc(statsRef, { xp: newXp }, { merge: true });
  };

  const saveWordToDb = async (wordData) => {
    if (!user) return;
    // Check if word exists to prevent dupes (simple check by word string)
    const existing = history.find(h => h.word.toLowerCase() === wordData.word.toLowerCase());
    const docId = existing ? existing.id : (wordData.id || crypto.randomUUID());
    const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', docId);
    await setDoc(docRef, { ...wordData, id: docId }, { merge: true });
  };

  const addWordsBulk = async (words) => {
    if (!user) return;
    // Write each word in parallel
    const promises = words.map(w => saveWordToDb(w));
    await Promise.all(promises);
  };

  const deleteWord = async (id) => {
    if (!user) return;
    await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', id));
  };

  const updateReviewDate = async (id, nextDate) => {
      if (!user) return;
      const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'vocab', id);
      await updateDoc(docRef, { nextReview: nextDate });
  };

  const analyzeWord = (word) => { setActiveWord(word); setView('analyzer'); };
  const reviewsDue = history.filter(h => h.nextReview && h.nextReview <= Date.now()).length;
  const level = Math.floor(xp / 100) + 1;

  const tools = [
    { id: 'analyzer', name: 'Analyzer', icon: Search, color: 'bg-blue-500', desc: 'Deep dive' },
    { id: 'flashcards', name: 'Flashcards', icon: RotateCcw, color: 'bg-green-500', desc: 'Free study' },
    { id: 'library', name: 'Library', icon: LibraryIcon, color: 'bg-purple-600', desc: 'Manage words' },
    { id: 'deconstructor', name: 'Deconstructor', icon: Scissors, color: 'bg-orange-500', desc: 'Compound breaker' },
    { id: 'reader', name: 'Reader', icon: BookOpen, color: 'bg-emerald-500', desc: 'Text analyzer' },
    { id: 'roleplay', name: 'Roleplay', icon: MessageCircle, color: 'bg-purple-500', desc: 'AI Chat' },
    { id: 'builder', name: 'Builder', icon: Grid, color: 'bg-teal-500', desc: 'Sentences' },
    { id: 'dojo', name: 'Dojo', icon: Zap, color: 'bg-yellow-500', desc: 'Gender game' },
    { id: 'culture', name: 'Culture', icon: Coffee, color: 'bg-amber-600', desc: 'Idioms' },
    { id: 'decks', name: 'Decks', icon: Layers, color: 'bg-indigo-500', desc: 'Starters' },
    { id: 'grammar', name: 'Grammar', icon: PenTool, color: 'bg-rose-500', desc: 'Corrector' },
    { id: 'listening', name: 'Dictation', icon: Ear, color: 'bg-cyan-500', desc: 'Listening' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={()=>setView('dashboard')}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">W</div>
            <span className="font-bold text-xl tracking-tight">WortMeister</span>
          </div>
          <div className="flex items-center gap-4">
             <div className="flex items-center gap-1 text-xs text-slate-400">
                 {dbStatus === 'connected' ? <Cloud size={14} className="text-emerald-500"/> : <CloudOff size={14}/>}
             </div>
             <select value={userLevel} onChange={(e) => setUserLevel(e.target.value)} className="bg-slate-100 text-slate-700 font-bold text-sm py-1 px-2 rounded-lg border-none cursor-pointer">
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map(l => <option key={l} value={l}>{l}</option>)}
             </select>
             <div className="flex flex-col items-end">
                <div className="text-xs font-bold uppercase text-slate-400 tracking-wider">Lvl {level}</div>
                <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-amber-400" style={{width: `${xp % 100}%`}}></div></div>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
             {reviewsDue > 0 && (
                 <button onClick={() => setView('review')} className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 rounded-2xl shadow-lg shadow-indigo-200 flex items-center justify-between hover:scale-[1.02] transition-transform">
                     <div><h2 className="text-2xl font-bold">Daily Review</h2><p className="text-indigo-100">{reviewsDue} words due</p></div>
                     <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center"><RefreshCw size={24} className="animate-spin-slow"/></div>
                 </button>
             )}
             <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {tools.map(tool => (
                  <button key={tool.id} onClick={() => setView(tool.id)} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all text-left group">
                    <div className={`w-12 h-12 rounded-xl ${tool.color} text-white flex items-center justify-center mb-4 shadow-lg`}>
                       <tool.icon size={24} />
                    </div>
                    <h3 className="font-bold text-slate-800 text-lg mb-1">{tool.name}</h3>
                    <p className="text-xs text-slate-500">{tool.desc}</p>
                  </button>
                ))}
             </div>
          </div>
        )}

        {view === 'review' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><DailyReview history={history} onUpdateReview={updateReviewDate} addXP={addXP} onComplete={() => setView('dashboard')} /></div>}
        {view === 'analyzer' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Analyzer activeWord={activeWord} addXP={addXP} onSave={saveWordToDb} level={userLevel} /></div>}
        {view === 'library' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Library history={history} onDelete={deleteWord} onStudy={analyzeWord} /></div>}
        {view === 'flashcards' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Flashcards history={history} /></div>}
        {view === 'deconstructor' && <div className="animate-in zoom-in-95 max-w-2xl mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Deconstructor addXP={addXP}/></div>}
        {view === 'reader' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><ReaderMode onSelectWord={analyzeWord} level={userLevel}/></div>}
        {view === 'roleplay' && <div className="animate-in zoom-in-95 max-w-2xl mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Roleplay addXP={addXP} level={userLevel}/></div>}
        {view === 'builder' && <div className="animate-in zoom-in-95 max-w-2xl mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><SentenceBuilder addXP={addXP} level={userLevel}/></div>}
        {view === 'dojo' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><Dojo addXP={addXP} level={userLevel}/></div>}
        {view === 'culture' && <div className="animate-in zoom-in-95"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><CultureModule addXP={addXP}/></div>}
        {view === 'decks' && <div className="animate-in zoom-in-95 max-w-2xl mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><StarterDecks onAddWords={addWordsBulk} level={userLevel}/></div>}
        {view === 'grammar' && <div className="animate-in zoom-in-95 max-w-2xl mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><GrammarSurgeon addXP={addXP}/></div>}
        {view === 'listening' && <div className="animate-in zoom-in-95 max-w-lg mx-auto"><button onClick={()=>setView('dashboard')} className="mb-4 text-sm text-slate-500 hover:text-indigo-600 flex items-center gap-1"><ArrowRight className="rotate-180" size={14}/> Back</button><ListeningLab addXP={addXP} level={userLevel}/></div>}
      </main>
    </div>
  );
}