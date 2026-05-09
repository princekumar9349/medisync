// UploadCard.jsx – Drag & drop / tap upload with preview
import { useRef, useState } from 'react'

export default function UploadCard({ onScan, loading }) {
  const [preview, setPreview]   = useState(null)
  const [file, setFile]         = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef                = useRef()

  function handleFile(f) {
    if (!f || !f.type.startsWith('image/')) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    handleFile(e.dataTransfer.files[0])
  }

  function handleChange(e) {
    handleFile(e.target.files[0])
  }

  function handleScan() {
    if (file) onScan(file)
  }

  function handleRemove() {
    setFile(null)
    setPreview(null)
    inputRef.current.value = ''
  }

  return (
    <div className="card animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-brand-100 flex items-center justify-center">
          <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div>
          <h2 className="font-bold text-slate-800 text-base leading-tight">Upload Prescription</h2>
          <p className="text-xs text-slate-400">JPG, PNG, WebP supported</p>
        </div>
      </div>

      {/* Drop Zone */}
      {!preview ? (
        <div
          onClick={() => inputRef.current.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all duration-200
            ${dragOver ? 'border-brand-400 bg-brand-50' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'}`}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors duration-200
            ${dragOver ? 'bg-brand-100' : 'bg-slate-100'}`}>
            <svg className={`w-8 h-8 transition-colors duration-200 ${dragOver ? 'text-brand-500' : 'text-slate-400'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div className="text-center">
            <p className="font-semibold text-slate-600 text-sm">Tap to upload or drag here</p>
            <p className="text-xs text-slate-400 mt-1">Clear image of your prescription</p>
          </div>
        </div>
      ) : (
        <div className="relative rounded-xl overflow-hidden bg-slate-100">
          <img src={preview} alt="Prescription preview" className="w-full max-h-56 object-contain" />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 w-8 h-8 bg-slate-800/70 hover:bg-red-500 text-white rounded-full flex items-center justify-center transition-colors duration-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="absolute bottom-2 left-2 bg-green-500 text-white text-xs font-semibold px-2 py-1 rounded-full flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Ready
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleChange} />

      {/* Scan Button */}
      <button
        onClick={handleScan}
        disabled={!file || loading}
        className="btn-primary mt-4"
        id="scan-btn"
      >
        {loading ? (
          <>
            <svg className="w-5 h-5 spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Scanning…
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            Scan Prescription
          </>
        )}
      </button>
    </div>
  )
}
