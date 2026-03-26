import { useState, useEffect, useRef, useCallback } from "react";
import jsPDF from "jspdf";

const API_BASE = "http://localhost:8000";

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes === 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function formatTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const DETAIL_OPTIONS = [
  { value: "quick",    label: "⚡ Quick",    desc: "~90 sec · 3 sources" },
  { value: "standard", label: "📚 Standard", desc: "~150 sec · 5 sources" },
  { value: "deep",     label: "🔬 Deep",     desc: "~200 sec · 7 sources" },
];

const DARK = {
  appBg:         "#0e0e0e",
  sidebarBg:     "#111111",
  sidebarBorder: "#1c1c1c",
  headerBg:      "#0e0e0e",
  headerBorder:  "#1c1c1c",
  contentBg:     "#0e0e0e",
  inputBarBg:    "#0e0e0e",
  inputBarBorder:"#1c1c1c",
  textPrimary:   "#d0d0d0",
  textSecondary: "#888888",
  textMuted:     "#555555",
  textLogo:      "#ffffff",
  bubbleUser:    "#1a3a5c",
  bubbleUserText:"#d0e8ff",
  bubbleAI:      "#171717",
  bubbleAIText:  "#d0d0d0",
  bubbleAIBorder:"#202020",
  avatarAI:      "#1a3a5c",
  avatarUser:    "#2a4060",
  sourceChipBg:  "#1a2a3a",
  sourceChipBorder:"#253545",
  sourceChipText:"#7ec8f0",
  tabBg:         "transparent",
  tabActiveBg:   "#181818",
  tabText:       "#666666",
  tabActiveText: "#ffffff",
  tabActiveBorder:"#4fa3e0",
  selectBg:      "#181818",
  selectBorder:  "#252525",
  selectText:    "#bbbbbb",
  sessionItemBg: "transparent",
  sessionActiveBg:"#1a1a1a",
  sessionActiveBorder:"#4fa3e0",
  newChatBg:     "linear-gradient(135deg,#1a3a5c,#1e5080)",
  newChatBorder: "#2a5a8a",
  newChatText:   "#7ec8f0",
  deleteBtnColor:"#444444",
  badgeColor:    "#444444",
  dropZoneBg:    "#111111",
  dropZoneBorder:"#252525",
  docCardBg:     "#131313",
  docCardBorder: "#1e1e1e",
  docBtnBg:      "#1a2a3a",
  docBtnBorder:  "#253545",
  docBtnText:    "#7ec8f0",
  summaryBtnBg:  "#131313",
  summaryBtnBorder:"#222222",
  summaryBtnText:"#888888",
  textareaBg:    "#131313",
  textareaBorder:"#222222",
  micBtnBg:      "#1e3a5c",
  micBtnBorder:  "#2a5a8a",
  micBtnText:    "#7ec8f0",
  micActiveBg:   "#5c1a1a",
  micActiveBorder:"#c03030",
  micActiveText: "#ffaaaa",
  sendBtnBg:     "linear-gradient(135deg,#1a5c8a,#1a7ac0)",
  speakBtnBg:    "#181818",
  speakBtnBorder:"#222222",
  speakBtnText:  "#777777",
  pdfHeaderBg:   "#111111",
  footerText:    "#444444",
  footerBorder:  "#181818",
  scrollbarThumb:"#252525",
  themeBtnBg:    "#1a1a1a",
  themeBtnBorder:"#2a2a2a",
  themeBtnText:  "#888888",
  exportBtnBg:   "#1a3a5c",
  exportBtnBorder:"#2a5a8a",
  exportBtnText: "#7ec8f0",
};

const LIGHT = {
  appBg:         "#f5f5f5",
  sidebarBg:     "#ffffff",
  sidebarBorder: "#e0e0e0",
  headerBg:      "#ffffff",
  headerBorder:  "#e0e0e0",
  contentBg:     "#f5f5f5",
  inputBarBg:    "#ffffff",
  inputBarBorder:"#e0e0e0",
  textPrimary:   "#1a1a1a",
  textSecondary: "#555555",
  textMuted:     "#999999",
  textLogo:      "#0a0a0a",
  bubbleUser:    "#1a5a9a",
  bubbleUserText:"#ffffff",
  bubbleAI:      "#ffffff",
  bubbleAIText:  "#1a1a1a",
  bubbleAIBorder:"#e0e0e0",
  avatarAI:      "#1a5a9a",
  avatarUser:    "#2a6aaa",
  sourceChipBg:  "#e8f0f8",
  sourceChipBorder:"#b0c8e8",
  sourceChipText:"#1a5a9a",
  tabBg:         "transparent",
  tabActiveBg:   "#f0f0f0",
  tabText:       "#888888",
  tabActiveText: "#1a1a1a",
  tabActiveBorder:"#1a5a9a",
  selectBg:      "#f0f0f0",
  selectBorder:  "#d0d0d0",
  selectText:    "#333333",
  sessionItemBg: "transparent",
  sessionActiveBg:"#e8f0f8",
  sessionActiveBorder:"#1a5a9a",
  newChatBg:     "linear-gradient(135deg,#1a5a9a,#2a7acc)",
  newChatBorder: "#1a5a9a",
  newChatText:   "#ffffff",
  deleteBtnColor:"#aaaaaa",
  badgeColor:    "#999999",
  dropZoneBg:    "#fafafa",
  dropZoneBorder:"#cccccc",
  docCardBg:     "#ffffff",
  docCardBorder: "#e0e0e0",
  docBtnBg:      "#e8f0f8",
  docBtnBorder:  "#b0c8e8",
  docBtnText:    "#1a5a9a",
  summaryBtnBg:  "#f0f0f0",
  summaryBtnBorder:"#d0d0d0",
  summaryBtnText:"#555555",
  textareaBg:    "#f8f8f8",
  textareaBorder:"#d0d0d0",
  micBtnBg:      "#1a5a9a",
  micBtnBorder:  "#1a5a9a",
  micBtnText:    "#ffffff",
  micActiveBg:   "#c0392b",
  micActiveBorder:"#e74c3c",
  micActiveText: "#ffffff",
  sendBtnBg:     "linear-gradient(135deg,#1a5a9a,#2a7acc)",
  speakBtnBg:    "#f0f0f0",
  speakBtnBorder:"#d0d0d0",
  speakBtnText:  "#555555",
  pdfHeaderBg:   "#ffffff",
  footerText:    "#999999",
  footerBorder:  "#e0e0e0",
  scrollbarThumb:"#cccccc",
  themeBtnBg:    "#f0f0f0",
  themeBtnBorder:"#d0d0d0",
  themeBtnText:  "#555555",
  exportBtnBg:   "#1a5a9a",
  exportBtnBorder:"#1a5a9a",
  exportBtnText: "#ffffff",
};

function useVoice(onTranscript) {
  const [listening, setListening] = useState(false);
  const [speaking,  setSpeaking]  = useState(false);
  const [supported, setSupported] = useState(false);
  const recRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SR) {
      setSupported(true);
      const rec          = new SR();
      rec.continuous     = false;
      rec.interimResults = false;
      rec.lang           = "en-US";
      rec.onresult = (e) => onTranscript(e.results[0][0].transcript);
      rec.onend    = () => setListening(false);
      rec.onerror  = () => setListening(false);
      recRef.current = rec;
    }
    return () => window.speechSynthesis?.cancel();
  }, []);

  const startListening = useCallback(() => {
    if (!recRef.current) return;
    window.speechSynthesis?.cancel();
    recRef.current.start();
    setListening(true);
  }, []);

  const stopListening  = useCallback(() => { recRef.current?.stop(); setListening(false); }, []);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const u    = new SpeechSynthesisUtterance(text);
    u.rate     = 1.0; u.pitch = 1.0; u.volume = 1.0;
    u.onstart  = () => setSpeaking(true);
    u.onend    = () => setSpeaking(false);
    u.onerror  = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, []);

  const stopSpeaking = useCallback(() => { window.speechSynthesis?.cancel(); setSpeaking(false); }, []);

  return { listening, speaking, supported, startListening, stopListening, speak, stopSpeaking };
}

function PdfViewer({ sessionId, doc, t }) {
  if (!doc) return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
      justifyContent:"center", background: t.contentBg }}>
      <div style={{ fontSize:48, marginBottom:12 }}>📄</div>
      <p style={{ color: t.textSecondary, fontSize:14 }}>Upload a document to view it here</p>
    </div>
  );
  const url = `${API_BASE}/sessions/${sessionId}/pdf/${encodeURIComponent(doc.filename)}`;
  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding:"7px 12px", borderBottom:`1px solid ${t.sidebarBorder}`,
        display:"flex", justifyContent:"space-between", alignItems:"center",
        background: t.pdfHeaderBg, flexShrink:0 }}>
        <span style={{ fontSize:13, color: t.textPrimary, fontWeight:600 }}>📄 {doc.filename}</span>
        <span style={{ fontSize:11, color: t.textSecondary }}>{doc.pages} pages · {formatBytes(doc.size)}</span>
      </div>
      <iframe src={url} style={{ flex:1, border:"none", background:"#fff", width:"100%", height:"100%" }} title="PDF" />
    </div>
  );
}

function MessageBubble({ msg, isSpeaking, onSpeak, onStopSpeak, t }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display:"flex", gap:10, alignItems:"flex-start",
      justifyContent: isUser ? "flex-end" : "flex-start" }}>
      {!isUser && (
        <div style={{ width:32, height:32, borderRadius:"50%", background: t.avatarAI,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
          <span style={{ fontSize:14 }}>🤖</span>
        </div>
      )}
      <div style={{ maxWidth:"72%", display:"flex", flexDirection:"column", gap:4 }}>
        <div style={{
          background:    isUser ? t.bubbleUser    : t.bubbleAI,
          color:         isUser ? t.bubbleUserText : t.bubbleAIText,
          border:        isUser ? "none"           : `1px solid ${t.bubbleAIBorder}`,
          borderRadius:  isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          padding:"10px 14px", fontSize:13, lineHeight:1.65,
        }}>
          {msg.loading ? (
            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
              <span style={{ color: t.textSecondary, fontSize:13 }}>Analyzing documents</span>
              {msg.estimated && <span style={{ color: t.textMuted, fontSize:11 }}> ({msg.estimated} estimated)</span>}
              <span style={{ color:"#4fa3e0", letterSpacing:2, animation:"dotBlink 1.2s infinite" }}>●●●</span>
            </div>
          ) : (
            // ✅ whiteSpace pre-wrap renders \n as actual line breaks
            <span style={{ whiteSpace:"pre-wrap", lineHeight:1.65 }}>
              {msg.isVoiceInput && <span style={{ marginRight:4 }}>🎤</span>}
              {msg.content}
            </span>
          )}
        </div>
        {!msg.loading && msg.sources && msg.sources.length > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:4, alignItems:"center", paddingLeft:2 }}>
            <span style={{ fontSize:11, color: t.textMuted, marginRight:4 }}>Sources:</span>
            {msg.sources.map((s, i) => (
              <span key={i} style={{ background: t.sourceChipBg, border:`1px solid ${t.sourceChipBorder}`,
                borderRadius:4, padding:"2px 7px", fontSize:10, color: t.sourceChipText }}>
                {s}
              </span>
            ))}
            {msg.chunks_used && (
              <span style={{ fontSize:10, color: t.textMuted, marginLeft:4 }}>· {msg.chunks_used} chunks</span>
            )}
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:8,
          alignSelf: isUser ? "flex-end" : "flex-start" }}>
          {msg.timestamp && <span style={{ fontSize:10, color: t.textMuted }}>{formatTime(msg.timestamp)}</span>}
          {!isUser && !msg.loading && msg.content && (
            <button
              onClick={() => isSpeaking ? onStopSpeak() : onSpeak(msg.content)}
              style={{ background: t.speakBtnBg, border:`1px solid ${t.speakBtnBorder}`,
                borderRadius:5, color: t.speakBtnText, padding:"2px 8px",
                fontSize:10, cursor:"pointer", fontWeight:500 }}
              title={isSpeaking ? "Stop" : "Read aloud"}
            >
              {isSpeaking ? "⏹ Stop" : "🔊 Read"}
            </button>
          )}
        </div>
      </div>
      {isUser && (
        <div style={{ width:32, height:32, borderRadius:"50%", background: t.avatarUser,
          display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:2 }}>
          <span style={{ fontSize:13, fontWeight:700, color:"#fff" }}>U</span>
        </div>
      )}
    </div>
  );
}

function DocumentsPanel({ sessionId, documents, onUpload, onViewPdf, uploading, t }) {
  const fileRef = useRef(null);
  const handleFile = useCallback((file) => {
    if (file && file.type === "application/pdf") onUpload(file);
  }, [onUpload]);

  return (
    <div style={{ flex:1, overflowY:"auto", padding:20,
      display:"flex", flexDirection:"column", gap:16, background: t.contentBg }}>
      <div
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer?.files[0]); }}
        style={{ border:`2px dashed ${t.dropZoneBorder}`, borderRadius:12,
          padding:"28px 20px", textAlign:"center", cursor:"pointer",
          background: t.dropZoneBg, transition:"border-color 0.2s" }}
      >
        <input ref={fileRef} type="file" accept=".pdf" style={{ display:"none" }}
          onChange={(e) => handleFile(e.target.files[0])} />
        {uploading ? (
          <div style={{ color:"#4fa3e0", fontSize:13 }}>⏳ Uploading and indexing...</div>
        ) : (
          <>
            <div style={{ fontSize:32, marginBottom:8 }}>📂</div>
            <div style={{ fontSize:13, color: t.textPrimary, fontWeight:600 }}>Upload New Document</div>
            <div style={{ fontSize:11, color: t.textSecondary, marginTop:4 }}>Drop PDF here or click to browse</div>
            <div style={{ fontSize:10, color: t.textMuted, marginTop:2 }}>Max 20 MB · 200 pages · Fully offline</div>
          </>
        )}
      </div>
      {documents.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <div style={{ fontSize:11, color: t.textMuted, marginBottom:4, fontWeight:700,
            textTransform:"uppercase", letterSpacing:1 }}>
            Loaded Documents ({documents.length})
          </div>
          {documents.map((doc, i) => (
            <div key={i} style={{ background: t.docCardBg, border:`1px solid ${t.docCardBorder}`,
              borderRadius:10, padding:"12px 14px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:22 }}>📄</span>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, color: t.textPrimary, fontWeight:600,
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    ✅ {doc.filename}
                  </div>
                  <div style={{ fontSize:11, color: t.textSecondary, marginTop:3 }}>
                    {doc.pages || "?"} pages · {formatBytes(doc.size)} · {doc.chunks || "?"} chunks indexed
                  </div>
                </div>
              </div>
              <div style={{ marginTop:10 }}>
                <button onClick={() => onViewPdf(doc)}
                  style={{ background: t.docBtnBg, border:`1px solid ${t.docBtnBorder}`,
                    borderRadius:6, color: t.docBtnText, padding:"5px 12px",
                    fontSize:12, cursor:"pointer", fontWeight:500 }}>
                  👁 View PDF in Split View
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [isDark,          setIsDark]          = useState(true);
  const [sessions,        setSessions]        = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [documents,       setDocuments]       = useState([]);
  const [question,        setQuestion]        = useState("");
  const [loading,         setLoading]         = useState(false);
  const [uploading,       setUploading]       = useState(false);
  const [view,            setView]            = useState("chat");
  const [detailLevel,     setDetailLevel]     = useState("standard");
  const [viewingPdf,      setViewingPdf]      = useState(null);
  const [speakingIdx,     setSpeakingIdx]     = useState(null);
  const [wasVoiceInput,   setWasVoiceInput]   = useState(false);
  const chatEndRef = useRef(null);
  const abortControllerRef = useRef(null);

  const t     = isDark ? DARK : LIGHT;
  const voice = useVoice((transcript) => {
    setQuestion(transcript);
    setWasVoiceInput(true);
  });

  useEffect(() => {
    const link = document.querySelector("link[rel='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y="0.9em" font-size="90">🤖</text></svg>';
    document.head.appendChild(link);
  }, []);

  const cancelPendingRequests = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const createAbortController = useCallback(() => {
    cancelPendingRequests();
    abortControllerRef.current = new AbortController();
    return abortControllerRef.current;
  }, [cancelPendingRequests]);

  const exportChatToPDF = useCallback(() => {
    if (messages.length === 0) { alert("No messages to export!"); return; }
    try {
      const pdf = new jsPDF();
      const pageWidth  = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin   = 15;
      const maxWidth = pageWidth - (margin * 2);
      let y = margin;

      pdf.setFontSize(18); pdf.setFont(undefined, 'bold');
      pdf.text("TellMe.ai Chat Export", margin, y); y += 10;
      pdf.setFontSize(10); pdf.setFont(undefined, 'normal');
      const sessionTitle = sessions.find(s => s.session_id === activeSessionId)?.title || "Chat Session";
      pdf.text(sessionTitle, margin, y); y += 5;
      pdf.text(`Exported: ${new Date().toLocaleString()}`, margin, y); y += 10;
      pdf.setDrawColor(200, 200, 200);
      pdf.line(margin, y, pageWidth - margin, y); y += 10;

      messages.forEach((msg) => {
        if (y > pageHeight - 40) { pdf.addPage(); y = margin; }
        if (msg.role === "user") {
          pdf.setFontSize(11); pdf.setFont(undefined, 'bold'); pdf.setTextColor(26, 90, 154);
          pdf.text(msg.isVoiceInput ? "🎤 Question:" : "Question:", margin, y); y += 6;
          pdf.setFont(undefined, 'normal'); pdf.setTextColor(0, 0, 0);
          const lines = pdf.splitTextToSize(msg.content, maxWidth);
          pdf.text(lines, margin, y); y += (lines.length * 5) + 8;
        }
        if (msg.role === "assistant" && !msg.loading) {
          pdf.setFontSize(11); pdf.setFont(undefined, 'bold'); pdf.setTextColor(60, 60, 60);
          pdf.text("Answer:", margin, y); y += 6;
          pdf.setFont(undefined, 'normal'); pdf.setTextColor(0, 0, 0);
          const lines = pdf.splitTextToSize(msg.content, maxWidth);
          pdf.text(lines, margin, y); y += (lines.length * 5) + 5;
          if (msg.sources?.length > 0) {
            pdf.setFontSize(9); pdf.setTextColor(100, 100, 100);
            pdf.text(`Sources: ${msg.sources.join(", ")}`, margin, y); y += 5;
          }
          if (msg.timestamp) {
            pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
            pdf.text(new Date(msg.timestamp).toLocaleString(), margin, y); y += 8;
          }
          pdf.setDrawColor(230, 230, 230);
          pdf.line(margin, y, pageWidth - margin, y); y += 8;
        }
      });

      const totalPages = pdf.internal.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
        pdf.text(`Page ${i} of ${totalPages} | Generated by TellMe.ai`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }
      pdf.save(`TellMe-Chat-${activeSessionId.substring(0, 8)}-${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF export failed:", error);
      alert("Failed to export PDF. Please try again.");
    }
  }, [messages, sessions, activeSessionId]);

  useEffect(() => { loadSessions(); }, []);

  const loadSessions = async () => {
    try {
      const res  = await fetch(`${API_BASE}/sessions`);
      const data = await res.json();
      const list = data.sessions || [];
      setSessions(list);
      if (list.length > 0) activateSession(list[0].session_id);
      else                  createNewSession();
    } catch { createNewSession(); }
  };

  const createNewSession = async () => {
    cancelPendingRequests(); voice.stopSpeaking(); setSpeakingIdx(null);
    try {
      const res  = await fetch(`${API_BASE}/sessions`, { method:"POST" });
      const data = await res.json();
      setActiveSessionId(data.session_id);
      setMessages([]); setDocuments([]); setViewingPdf(null); setView("chat");
      setSessions(prev => [{
        session_id: data.session_id,
        created_at: data.created_at || new Date().toISOString(),
        title: "New Chat", message_count: 0, document_count: 0,
      }, ...prev]);
    } catch (e) { console.error("Create session failed", e); }
  };

  const activateSession = async (sid) => {
    cancelPendingRequests(); voice.stopSpeaking(); setSpeakingIdx(null);
    setActiveSessionId(sid);
    setMessages([]); setDocuments([]); setViewingPdf(null); setView("chat");
    fetchHistory(sid); fetchDocuments(sid);
  };

  const deleteSession = async (sid, e) => {
    e.stopPropagation();
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    try {
      if (sid === activeSessionId) { cancelPendingRequests(); voice.stopSpeaking(); setSpeakingIdx(null); }
      await fetch(`${API_BASE}/sessions/${sid}`, { method:"DELETE" });
      const remaining = sessions.filter(s => s.session_id !== sid);
      setSessions(remaining);
      if (sid === activeSessionId) {
        if (remaining.length > 0) activateSession(remaining[0].session_id);
        else                       createNewSession();
      }
    } catch (e) { console.error("Delete failed", e); }
  };

  const fetchHistory = async (sid) => {
    try {
      const res  = await fetch(`${API_BASE}/sessions/${sid}/history`);
      const data = await res.json();
      setMessages((data.history || []).map(h => ({
        role: h.role, content: h.content,
        sources: h.sources || [], chunks_used: h.chunks_used, timestamp: h.timestamp,
      })));
    } catch {}
  };

  const fetchDocuments = async (sid) => {
    try {
      const res  = await fetch(`${API_BASE}/sessions/${sid}/documents`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {}
  };

  const handleUpload = async (file) => {
    if (!activeSessionId) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res  = await fetch(`${API_BASE}/sessions/${activeSessionId}/upload`, { method:"POST", body:fd });
      const data = await res.json();
      if (data.filename) {
        await fetchDocuments(activeSessionId);
        setSessions(prev => prev.map(s =>
          s.session_id === activeSessionId ? { ...s, document_count: s.document_count + 1 } : s
        ));
        setView("chat");
      }
    } catch (e) { console.error("Upload failed", e); }
    setUploading(false);
  };

  const handleAsk = async () => {
    if (!question.trim() || loading || !activeSessionId) return;
    const q = question.trim();
    const voiceInput = wasVoiceInput;
    setQuestion(""); setWasVoiceInput(false);
    voice.stopSpeaking(); setSpeakingIdx(null);

    const detail = DETAIL_OPTIONS.find(d => d.value === detailLevel);
    setMessages(prev => [...prev,
      { role:"user", content:q, timestamp:new Date().toISOString(), isVoiceInput: voiceInput },
      { role:"assistant", content:"", loading:true, estimated:detail?.desc, timestamp:new Date().toISOString() },
    ]);
    setLoading(true);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);

    try {
      const controller = createAbortController();
      const res = await fetch(
        `${API_BASE}/sessions/${activeSessionId}/query_stream`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: q, detail_level: detailLevel }),
          signal: controller.signal,
        }
      );

      if (!res.body) throw new Error("Streaming not supported");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answerText = "";

      setMessages(prev => [
        ...prev.slice(0, -1),
        { role:"assistant", content:"", sources:[], timestamp:new Date().toISOString() },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop();

        for (const evt of events) {
          const lines = evt.split("\n");
          let eventType = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventType = line.replace("event:", "").trim();
            if (line.startsWith("data:"))  data += line.replace("data:", "");
          }

          if (eventType === "token") {
            // ✅ ONLY fix: decode \\n back to real \n — NO other regex
            // whiteSpace:pre-wrap in the bubble will render \n as line breaks
            const cleanToken = data.replace(/\\n/g, "\n");
            answerText += cleanToken;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1].content = answerText;
              return updated;
            });
          }

          if (eventType === "sources") {
            try {
              const parsed = JSON.parse(data);
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1].sources = parsed.map(s => `${s.filename} p.${s.page}`);
                return updated;
              });
            } catch {}
          }

          if (eventType === "done") {
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1].timestamp = new Date().toISOString();
              return updated;
            });
          }
        }
      }

      setSessions(prev => prev.map(s =>
        s.session_id === activeSessionId ? {
          ...s, message_count: s.message_count + 1,
          title: s.title === "New Chat" ? (q.length > 50 ? q.slice(0,50)+"…" : q) : s.title,
        } : s
      ));
    } catch (e) {
      if (e.name === 'AbortError') {
        setMessages(prev => prev.slice(0, -2));
      } else {
        setMessages(prev => [...prev.slice(0,-1), {
          role:"assistant",
          content:`⚠️ Error: ${e.message}. Make sure backend and Ollama are running.`,
          timestamp: new Date().toISOString(),
        }]);
      }
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
  };

  const handleSummary = async () => {
    if (documents.length === 0 || loading || !activeSessionId) return;
    voice.stopSpeaking(); setSpeakingIdx(null);
    const detail = DETAIL_OPTIONS.find(d => d.value === detailLevel);
    setMessages(prev => [...prev,
      { role:"user", content:"📋 Summarize this document", timestamp:new Date().toISOString() },
      { role:"assistant", content:"", loading:true, estimated:detail?.desc, timestamp:new Date().toISOString() },
    ]);
    setLoading(true); setView("chat");
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 50);

    try {
      const controller = createAbortController();
      const res  = await fetch(`${API_BASE}/sessions/${activeSessionId}/summary?detail_level=${detailLevel}`, {
        signal: controller.signal,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Summary failed");
      setMessages(prev => [...prev.slice(0,-1), {
        role:"assistant", content: data.summary || "Could not generate summary.",
        sources: data.sources || [], chunks_used: data.chunks_used,
        timestamp: new Date().toISOString(),
      }]);
      await loadSessions();
    } catch (e) {
      if (e.name === 'AbortError') {
        setMessages(prev => prev.slice(0, -2));
      } else {
        setMessages(prev => [...prev.slice(0,-1), {
          role:"assistant", content:`⚠️ Summary error: ${e.message}`,
          timestamp: new Date().toISOString(),
        }]);
      }
    }
    setLoading(false);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior:"smooth" }), 100);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleAsk(); }
  };

  const chatView = (
    <div style={{ flex:1, overflowY:"auto", padding:"16px 20px",
      display:"flex", flexDirection:"column", background: t.contentBg }}>
      {messages.length === 0 ? (
        <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
          justifyContent:"center", textAlign:"center", padding:40 }}>
          <div style={{ fontSize:52, marginBottom:12 }}>💬</div>
          <div style={{ fontSize:18, color: t.textPrimary, fontWeight:600 }}>
            Ask anything about your documents
          </div>
          <div style={{ fontSize:13, color: t.textSecondary, marginTop:8 }}>
            {documents.length === 0
              ? "Upload a PDF first, then ask questions here"
              : `${documents.length} document${documents.length > 1 ? "s" : ""} ready — type or speak your question`}
          </div>
          {documents.length === 0 && (
            <button onClick={() => setView("docs")}
              style={{ marginTop:16, background: t.docBtnBg, border:`1px solid ${t.docBtnBorder}`,
                borderRadius:8, color: t.docBtnText, padding:"8px 16px",
                fontSize:13, cursor:"pointer", fontWeight:600 }}>
              📂 Upload Document →
            </button>
          )}
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:18 }}>
          {messages.map((m, i) => (
            <MessageBubble key={i} msg={m} t={t}
              isSpeaking={speakingIdx === i && voice.speaking}
              onSpeak={(text) => { setSpeakingIdx(i); voice.speak(text); }}
              onStopSpeak={() => { setSpeakingIdx(null); voice.stopSpeaking(); }}
            />
          ))}
          <div ref={chatEndRef} />
        </div>
      )}
    </div>
  );

  return (
    <div style={{ display:"flex", height:"100vh", width:"100vw", background: t.appBg,
      color: t.textPrimary, fontFamily:"'Segoe UI',system-ui,sans-serif", overflow:"hidden",
      position:"fixed", top:0, left:0, right:0, bottom:0 }}>

      <aside style={{ width:220, minWidth:220, background: t.sidebarBg,
        borderRight:`1px solid ${t.sidebarBorder}`,
        display:"flex", flexDirection:"column", padding:"16px 0", overflow:"hidden" }}>
        <div style={{ padding:"4px 16px 14px", borderBottom:`1px solid ${t.sidebarBorder}`,
          marginBottom:10, display:"flex", flexDirection:"column", gap:6 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ fontSize:22, fontWeight:800, color: t.textLogo, letterSpacing:"-0.5px" }}>
              TellMe<span style={{ color:"#4fa3e0" }}>.ai</span>
            </div>
            <button onClick={() => setIsDark(d => !d)}
              title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
              style={{ background: t.themeBtnBg, border:`1px solid ${t.themeBtnBorder}`,
                borderRadius:20, color: t.themeBtnText, padding:"4px 10px",
                fontSize:14, cursor:"pointer", fontWeight:600, lineHeight:1 }}>
              {isDark ? "☀️" : "🌙"}
            </button>
          </div>
          <div style={{ fontSize:10, color: t.textMuted, letterSpacing:2, textTransform:"uppercase" }}>
            Document Intelligence
          </div>
        </div>

        <button onClick={createNewSession}
          style={{ margin:"0 12px 10px", padding:"10px 16px",
            background: t.newChatBg, border:`1px solid ${t.newChatBorder}`,
            borderRadius:8, color: t.newChatText, fontSize:13, fontWeight:700, cursor:"pointer" }}>
          ✦ New Chat
        </button>

        <div style={{ flex:1, overflowY:"auto", padding:"0 8px" }}>
          {sessions.length === 0 && (
            <div style={{ padding:"12px", fontSize:11, color: t.textMuted, textAlign:"center" }}>No chats yet</div>
          )}
          {sessions.map((s) => (
            <div key={s.session_id} onClick={() => activateSession(s.session_id)}
              style={{ padding:"9px 10px", borderRadius:8, cursor:"pointer", marginBottom:3,
                borderLeft: s.session_id === activeSessionId
                  ? `2px solid ${t.sessionActiveBorder}` : "2px solid transparent",
                background: s.session_id === activeSessionId ? t.sessionActiveBg : t.sessionItemBg,
                transition:"all 0.15s" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:4 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600,
                    color: s.session_id === activeSessionId ? t.textPrimary : t.textSecondary,
                    whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    💬 {s.title || "New Chat"}
                  </div>
                  <div style={{ fontSize:10, color: t.textMuted, marginTop:2 }}>
                    {s.document_count > 0 ? `${s.document_count} doc · ` : ""}
                    {s.message_count || 0} Q&A · {new Date(s.created_at).toLocaleDateString()}
                  </div>
                </div>
                <button onClick={(e) => deleteSession(s.session_id, e)} title="Delete this chat"
                  style={{ background:"transparent", border:"none", color: t.deleteBtnColor,
                    fontSize:12, cursor:"pointer", padding:"1px 4px", borderRadius:4, flexShrink:0 }}>
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding:"10px 12px 0", borderTop:`1px solid ${t.sidebarBorder}`,
          display:"flex", flexDirection:"column", gap:3 }}>
          <div style={{ fontSize:10, color: t.badgeColor }}>🔒 Fully Offline</div>
          <div style={{ fontSize:10, color: t.badgeColor }}>🤖 phi3:mini · CPU</div>
          <div style={{ fontSize:10, color: t.badgeColor }}>☁️ No cloud</div>
        </div>
      </aside>

      <main style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        <header style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
          padding:"0 16px", borderBottom:`1px solid ${t.headerBorder}`,
          background: t.headerBg, height:50, gap:12, flexShrink:0 }}>
          <div style={{ display:"flex", gap:2 }}>
            {[
              { key:"chat",  label:"💬 Chat" },
              { key:"docs",  label:`📁 Documents (${documents.length})` },
              { key:"split", label:"⬜ Split View" },
            ].map(tab => (
              <button key={tab.key} onClick={() => setView(tab.key)}
                style={{ padding:"6px 13px", background: view===tab.key ? t.tabActiveBg : t.tabBg,
                  border:"none", borderBottom: view===tab.key
                    ? `2px solid ${t.tabActiveBorder}` : "2px solid transparent",
                  color: view===tab.key ? t.tabActiveText : t.tabText,
                  fontSize:13, cursor:"pointer", fontWeight:500,
                  borderRadius:"6px 6px 0 0", transition:"all 0.15s" }}>
                {tab.label}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
            <button onClick={exportChatToPDF} disabled={messages.length === 0}
              title="Export chat as PDF"
              style={{ background: t.exportBtnBg, border:`1px solid ${t.exportBtnBorder}`,
                borderRadius:6, color: t.exportBtnText, padding:"5px 10px",
                fontSize:12, cursor: messages.length === 0 ? "not-allowed" : "pointer",
                fontWeight:600, opacity: messages.length === 0 ? 0.4 : 1, whiteSpace:"nowrap" }}>
              📄 Export PDF
            </button>
            <label style={{ fontSize:11, color: t.textSecondary, marginRight:8, whiteSpace:"nowrap" }}>
              Answer Detail:
            </label>
            <select value={detailLevel} onChange={e => setDetailLevel(e.target.value)}
              style={{ background: t.selectBg, border:`1px solid ${t.selectBorder}`,
                borderRadius:6, color: t.selectText, padding:"5px 8px",
                fontSize:12, cursor:"pointer", outline:"none" }}>
              {DETAIL_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
              ))}
            </select>
          </div>
        </header>

        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {view === "chat" && chatView}
          {view === "docs" && (
            <DocumentsPanel
              sessionId={activeSessionId} documents={documents}
              onUpload={handleUpload} uploading={uploading} t={t}
              onViewPdf={(doc) => { setViewingPdf(doc); setView("split"); }}
            />
          )}
          {view === "split" && (
            <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
              <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                {documents.length === 0 ? (
                  <div style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center",
                    justifyContent:"center", background: t.contentBg }}>
                    <div style={{ fontSize:40, marginBottom:10 }}>📄</div>
                    <p style={{ color: t.textSecondary, fontSize:13 }}>No documents uploaded yet</p>
                    <button onClick={() => setView("docs")}
                      style={{ marginTop:16, background: t.docBtnBg, border:`1px solid ${t.docBtnBorder}`,
                        borderRadius:8, color: t.docBtnText, padding:"8px 16px",
                        fontSize:13, cursor:"pointer", fontWeight:600 }}>
                      Upload PDF →
                    </button>
                  </div>
                ) : (
                  <div style={{ height:"100%", display:"flex", flexDirection:"column" }}>
                    {documents.length > 1 && (
                      <div style={{ display:"flex", gap:6, padding:"6px 10px",
                        borderBottom:`1px solid ${t.sidebarBorder}`, flexWrap:"wrap",
                        background: t.headerBg }}>
                        {documents.map((d, i) => (
                          <button key={i} onClick={() => setViewingPdf(d)}
                            style={{ background: viewingPdf?.filename===d.filename ? t.docBtnBg : "transparent",
                              border: viewingPdf?.filename===d.filename ? `1px solid ${t.docBtnBorder}` : "none",
                              color: viewingPdf?.filename===d.filename ? t.docBtnText : t.textSecondary,
                              fontSize:11, cursor:"pointer", padding:"3px 8px", borderRadius:4 }}>
                            {d.filename}
                          </button>
                        ))}
                      </div>
                    )}
                    <PdfViewer sessionId={activeSessionId} doc={viewingPdf || documents[0]} t={t} />
                  </div>
                )}
              </div>
              <div style={{ width:1, background: t.sidebarBorder, flexShrink:0 }} />
              <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
                {chatView}
              </div>
            </div>
          )}
        </div>

        <div style={{ display:"flex", alignItems:"flex-end", gap:8, padding:"10px 14px",
          borderTop:`1px solid ${t.inputBarBorder}`, background: t.inputBarBg, flexShrink:0 }}>
          <button onClick={handleSummary}
            disabled={documents.length === 0 || loading}
            title={documents.length === 0 ? "Upload a document first" : "Summarize the document"}
            style={{ background: t.summaryBtnBg, border:`1px solid ${t.summaryBtnBorder}`,
              borderRadius:8, color: t.summaryBtnText, padding:"8px 11px",
              fontSize:12, fontWeight:600, whiteSpace:"nowrap", flexShrink:0, height:38,
              cursor: (documents.length===0 || loading) ? "not-allowed" : "pointer",
              opacity: (documents.length===0 || loading) ? 0.4 : 1 }}>
            📋 Summary
          </button>
          <textarea value={question} onChange={e => setQuestion(e.target.value)}
            onKeyDown={handleKeyDown} disabled={loading || voice.listening}
            placeholder={
              voice.listening ? "🎙 Listening... speak your question now"
                : documents.length === 0 ? "Upload a document above, then type your question here..."
                : `Ask anything about your ${documents.length} document${documents.length > 1 ? "s" : ""}... (Enter to send)`
            }
            rows={1}
            style={{ flex:1, background: t.textareaBg, border:`1px solid ${t.textareaBorder}`,
              borderRadius:10, color: t.textPrimary, padding:"9px 13px",
              fontSize:13, resize:"none", outline:"none", fontFamily:"inherit",
              lineHeight:1.5, minHeight:38, maxHeight:120, transition:"border-color 0.2s" }}
          />
          {voice.supported && (
            <button
              onClick={voice.listening ? voice.stopListening : voice.startListening}
              disabled={loading}
              title={voice.listening ? "Stop listening" : "Speak your question"}
              style={{
                width:38, height:38, borderRadius:8, fontSize:18,
                cursor: loading ? "not-allowed" : "pointer", flexShrink:0,
                display:"flex", alignItems:"center", justifyContent:"center",
                fontWeight:700, transition:"all 0.2s",
                background: voice.listening ? t.micActiveBg    : t.micBtnBg,
                border:     voice.listening ? `2px solid ${t.micActiveBorder}` : `2px solid ${t.micBtnBorder}`,
                color:      voice.listening ? t.micActiveText  : t.micBtnText,
                boxShadow:  voice.listening ? `0 0 8px ${t.micActiveBorder}` : "none",
              }}>
              {voice.listening ? "⏹" : "🎙"}
            </button>
          )}
          <button onClick={handleAsk} disabled={!question.trim() || loading} title="Send (Enter)"
            style={{ width:40, height:38, background: t.sendBtnBg, border:"none",
              borderRadius:8, color:"#ffffff", fontSize:16, cursor:"pointer", flexShrink:0,
              display:"flex", alignItems:"center", justifyContent:"center",
              opacity: (!question.trim() || loading) ? 0.4 : 1 }}>
            {loading ? "⏳" : "➤"}
          </button>
        </div>

        <div style={{ textAlign:"center", padding:"5px 16px 7px", fontSize:10,
          color: t.footerText, borderTop:`1px solid ${t.footerBorder}`,
          lineHeight:1.9, flexShrink:0, background: t.inputBarBg }}>
          <span style={{ color:"#4fa3e0", fontWeight:600 }}>Powered by TellMe.ai</span>
          <span style={{ color: t.textMuted }}> | </span>
          <span>Fully Offline</span>
          <span style={{ color: t.textMuted }}> | </span>
          <span>No Data Sent Anywhere</span>
          <br />
          <span>AI-generated answers may contain errors — always verify important information</span>
        </div>
      </main>

      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { height: 100%; width: 100%; overflow: hidden; }
        @keyframes dotBlink { 0%,100%{opacity:0.2} 50%{opacity:1} }
        textarea:focus { outline:none; }
        ::-webkit-scrollbar { width:4px; }
        ::-webkit-scrollbar-track { background: ${t.appBg}; }
        ::-webkit-scrollbar-thumb { background: ${t.scrollbarThumb}; border-radius:4px; }
        select option { background: ${t.selectBg}; color: ${t.selectText}; }
        button:hover { filter: brightness(1.1); }
      `}</style>
    </div>
  );
}