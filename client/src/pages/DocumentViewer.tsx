import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import api from '../lib/axios'
import type { Document, Signature } from '../types'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc =
  `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

const PDF_WIDTH = 750

interface DragState {
  sigId:   string
  offsetX: number
  offsetY: number
}

const DocumentViewer = () => {
  const { id }   = useParams()
  const navigate = useNavigate()
  const pageRef  = useRef<HTMLDivElement>(null)

  const [document,    setDocument]    = useState<Document | null>(null)
  const [numPages,    setNumPages]    = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading,     setLoading]     = useState<boolean>(true)
  const [signatures,  setSignatures]  = useState<Signature[]>([])
  const [placingMode, setPlacingMode] = useState<boolean>(false)
  const [dragState,   setDragState]   = useState<DragState | null>(null)
  const [finalizing,  setFinalizing]  = useState<boolean>(false)
  const [signedUrl,   setSignedUrl]   = useState<string | null>(null)

  // ── Fetch document & signatures ──────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [docRes, sigRes] = await Promise.all([
          api.get(`/docs/${id}`),
          api.get(`/signatures/${id}`),
        ])
        setDocument(docRes.data.data.document)
        setSignatures(sigRes.data.data.signatures)
      } catch {
        navigate('/dashboard')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [id])

  // ── Place new signature on PDF click ─────────────────────
  const handlePageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingMode || !pageRef.current || dragState) return

    const rect = pageRef.current.getBoundingClientRect()
    const x    = Math.round(e.clientX - rect.left)
    const y    = Math.round(e.clientY - rect.top)

    try {
      const res = await api.post('/signatures', {
        documentId: id,
        x,
        y,
        page:   currentPage,
        width:  200,
        height: 60,
      })
      setSignatures(prev => [...prev, res.data.data.signature])
      setPlacingMode(false)
    } catch (err) {
      console.error('Failed to place signature:', err)
    }
  }

  // ── Drag start ───────────────────────────────────────────
  const handleDragStart = (
    e: React.MouseEvent<HTMLDivElement>,
    sig: Signature
  ) => {
    e.stopPropagation()
    e.preventDefault()
    const el      = e.currentTarget.getBoundingClientRect()
    const offsetX = e.clientX - el.left
    const offsetY = e.clientY - el.top
    setDragState({ sigId: sig.id, offsetX, offsetY })
  }

  // ── Drag move ────────────────────────────────────────────
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragState || !pageRef.current) return

    const rect     = pageRef.current.getBoundingClientRect()
    const x        = Math.round(e.clientX - rect.left - dragState.offsetX)
    const y        = Math.round(e.clientY - rect.top  - dragState.offsetY)
    const clampedX = Math.max(0, Math.min(x, PDF_WIDTH - 200))
    const clampedY = Math.max(0, y)

    setSignatures(prev =>
      prev.map(s =>
        s.id === dragState.sigId ? { ...s, x: clampedX, y: clampedY } : s
      )
    )
  }

  // ── Drag end — save final position to DB ─────────────────
  const handleMouseUp = async () => {
    if (!dragState) return

    const sig = signatures.find(s => s.id === dragState.sigId)
    if (sig) {
      try {
        await api.patch(`/signatures/${sig.id}`, {
          x:    sig.x,
          y:    sig.y,
          page: sig.page,
        })
      } catch (err) {
        console.error('Failed to save position:', err)
      }
    }
    setDragState(null)
  }

  // ── Delete signature ─────────────────────────────────────
  const handleDelete = async (sigId: string) => {
    try {
      await api.delete(`/signatures/${sigId}`)
      setSignatures(prev => prev.filter(s => s.id !== sigId))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  // ── Finalize & embed signatures into PDF ─────────────────
  const handleFinalize = async () => {
    if (!window.confirm(
      'Finalize and sign this document? This cannot be undone.'
    )) return

    setFinalizing(true)
    try {
      const res = await api.post(`/signatures/finalize/${id}`)
      setSignedUrl(res.data.data.signedUrl)
      setSignatures(prev =>
        prev.map(s => ({ ...s, status: 'SIGNED' as const }))
      )
      alert('Document signed successfully!')
    } catch (err) {
      console.error('Finalize error:', err)
      alert('Failed to sign document.')
    } finally {
      setFinalizing(false)
    }
  }

  // ── Loading ──────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading document...
      </div>
    )
  }

  if (!document) {
    return null
  }

  const currentPageSignatures = signatures.filter(
    s => s.page === currentPage
  )

  return (
    <div className="min-h-screen bg-gray-100">

      {/* ── Toolbar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between sticky top-0 z-10">

        {/* Left side */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            Back
          </button>
          <h2 className="font-medium text-gray-900 text-sm truncate max-w-xs">
            {document.originalName}
          </h2>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            document.status === 'SIGNED'
              ? 'bg-green-50 text-green-600'
              : document.status === 'EXPIRED'
              ? 'bg-red-50 text-red-600'
              : 'bg-yellow-50 text-yellow-600'
          }`}>
            {document.status}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">

          {/* Page controls */}
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className="text-sm px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Prev
          </button>
          <span className="text-sm text-gray-600">
            {currentPage} / {numPages}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(numPages, p + 1))}
            disabled={currentPage >= numPages}
            className="text-sm px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
          >
            Next
          </button>

          {/* Add Signature button */}
          {document.status !== 'SIGNED' && (
            <button
              onClick={() => setPlacingMode(prev => !prev)}
              className={`text-sm px-4 py-2 rounded-lg font-medium transition ${
                placingMode
                  ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {placingMode ? 'Click PDF to place' : 'Add Signature'}
            </button>
          )}

          {/* Finalize button */}
          {signatures.length > 0 && document.status !== 'SIGNED' && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="text-sm px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
            >
              {finalizing ? 'Signing...' : 'Finalize and Sign'}
            </button>
          )}

        </div>
      </div>

      {/* ── Placing mode hint banner ── */}
      {placingMode && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-6 py-2 text-center text-sm text-yellow-700">
          Click anywhere on the PDF to place your signature box
        </div>
      )}

      {/* ── Signed success banner ── */}
      {signedUrl && (
        <div className="bg-green-50 border-b border-green-200 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-green-700">
            <span className="text-sm font-medium">
              Document signed successfully!
            </span>
          </div>
          
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition"
          >
            Download Signed PDF
          </a>
        </div>
      )}

      {/* ── PDF + Signature overlays ── */}
      <div className="flex justify-center py-8">
        <div
          ref={pageRef}
          style={{ width: PDF_WIDTH, position: 'relative' }}
          className={`shadow-xl select-none ${
            placingMode ? 'cursor-crosshair' :
            dragState   ? 'cursor-grabbing'  :
            'cursor-default'
          }`}
          onClick={handlePageClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >

          {/* PDF renders here */}
          <PDFDocument
            file={document.fileUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          >
            <Page
              pageNumber={currentPage}
              width={PDF_WIDTH}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </PDFDocument>

          {/* Signature boxes on top of PDF */}
          {currentPageSignatures.map(sig => (
            <div
              key={sig.id}
              onMouseDown={e => handleDragStart(e, sig)}
              style={{
                position: 'absolute',
                left:     sig.x,
                top:      sig.y,
                width:    sig.width,
                height:   sig.height,
                zIndex:   dragState?.sigId === sig.id ? 50 : 10,
                cursor:   dragState?.sigId === sig.id
                  ? 'grabbing' : 'grab',
              }}
              className={`border-2 border-dashed rounded flex items-center justify-center group ${
                sig.status === 'SIGNED'
                  ? 'border-green-500 bg-green-50'
                  : 'border-indigo-500 bg-indigo-50'
              }`}
            >
              <span className={`text-xs font-medium pointer-events-none ${
                sig.status === 'SIGNED'
                  ? 'text-green-600'
                  : 'text-indigo-600'
              }`}>
                {sig.status === 'SIGNED' ? 'Signed' : 'Sign here'}
              </span>

              {/* Delete button on hover */}
              {sig.status !== 'SIGNED' && (
                <button
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => {
                    e.stopPropagation()
                    handleDelete(sig.id)
                  }}
                  style={{ position: 'absolute', top: -8, right: -8 }}
                  className="w-5 h-5 bg-red-500 text-white rounded-full text-xs hidden group-hover:flex items-center justify-center z-50"
                >
                  x
                </button>
              )}
            </div>
          ))}

        </div>
      </div>

      {/* ── Signatures list below PDF ── */}
      {signatures.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 pb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Signature Fields ({signatures.length})
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {signatures.map(sig => (
              <div
                key={sig.id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Page {sig.page}</span>
                  <span className="text-gray-400 ml-2">
                    x: {Math.round(sig.x)}, y: {Math.round(sig.y)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    sig.status === 'SIGNED'
                      ? 'bg-green-50 text-green-600'
                      : 'bg-yellow-50 text-yellow-600'
                  }`}>
                    {sig.status}
                  </span>
                  {sig.status !== 'SIGNED' && (
                    <button
                      onClick={() => handleDelete(sig.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}

export default DocumentViewer