// ControlBar.jsx – Voice toggle + Language toggle
export default function ControlBar({ voiceOn, language, onVoiceToggle, onLangToggle }) {
  return (
    <div className="card flex items-center justify-between gap-4 animate-fade-in">
      {/* Voice Toggle */}
      <button
        id="voice-toggle"
        onClick={onVoiceToggle}
        className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border font-semibold text-sm transition-all duration-200 active:scale-95
          ${voiceOn
            ? 'bg-brand-600 border-brand-600 text-white shadow-md shadow-brand-200'
            : 'bg-white border-slate-200 text-slate-500 hover:border-brand-300'
          }`}
      >
        {voiceOn ? (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M15.536 8.464a5 5 0 010 7.072M12 6a6 6 0 010 12M9.5 8.5a5 5 0 000 7" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
          </svg>
        )}
        Voice {voiceOn ? 'ON' : 'OFF'}
      </button>

      {/* Divider */}
      <div className="w-px h-8 bg-slate-100"></div>

      {/* Language Toggle */}
      <button
        id="lang-toggle"
        onClick={onLangToggle}
        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border font-semibold text-sm transition-all duration-200 active:scale-95 bg-white border-slate-200 text-slate-600 hover:border-brand-300"
      >
        <span className="text-base">{language === 'EN' ? '🇬🇧' : '🇮🇳'}</span>
        <span>
          <span className={language === 'EN' ? 'text-brand-600 font-bold' : 'text-slate-400'}>EN</span>
          <span className="text-slate-300 mx-1">/</span>
          <span className={language === 'HI' ? 'text-brand-600 font-bold' : 'text-slate-400'}>HI</span>
        </span>
      </button>
    </div>
  )
}
