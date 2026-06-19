import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Document as PDFDocument, Page, pdfjs } from 'react-pdf'
import api from '../lib/axios'
import type { Document, Signature } from '../types'

import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

const BASE_WIDTH = 750

interface DragState {
  sigId: string
  offsetX: number
  offsetY: number
}

const DocumentViewer = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const pageRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [document, setDocument] = useState<Document | null>(null)
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [loading, setLoading] = useState<boolean>(true)
  const [signatures, setSignatures] = useState<Signature[]>([])
  const [placingMode, setPlacingMode] = useState<boolean>(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [finalizing, setFinalizing] = useState<boolean>(false)
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
  const [pdfWidth, setPdfWidth] = useState<number>(BASE_WIDTH)

  useEffect(() => {
    const updateWidth = () => {
      if (!containerRef.current) return
      const available = containerRef.current.clientWidth - 16
      setPdfWidth(Math.min(BASE_WIDTH, available))
    }
    updateWidth()
    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [])

  const scale = pdfWidth / BASE_WIDTH

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
  }, [id, navigate])

  const getPointFromEvent = (
    e: React.MouseEvent | React.TouchEvent
  ): { clientX: number; clientY: number } => {
    if ('touches' in e) {
      const t = e.touches[0] || e.changedTouches[0]
      return { clientX: t.clientX, clientY: t.clientY }
    }
    return { clientX: e.clientX, clientY: e.clientY }
  }

  const handlePageClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    if (!placingMode || !pageRef.current || dragState) return
    const rect = pageRef.current.getBoundingClientRect()
    const x = Math.round((e.clientX - rect.left) / scale)
    const y = Math.round((e.clientY - rect.top) / scale)

    try {
      const res = await api.post('/signatures', {
        documentId: id,
        x,
        y,
        page: currentPage,
        width: 200,
        height: 60,
      })
      setSignatures((prev) => [...prev, res.data.data.signature])
      setPlacingMode(false)
    } catch (err) {
      console.error('Failed to place signature:', err)
    }
  }

  const handleDragStart = (
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    sig: Signature
  ) => {
    e.stopPropagation()
    e.preventDefault()
    const el = e.currentTarget.getBoundingClientRect()
    const { clientX, clientY } = getPointFromEvent(e)
    const offsetX = clientX - el.left
    const offsetY = clientY - el.top
    setDragState({ sigId: sig.id, offsetX, offsetY })
  }

  const handleMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
      if (!dragState || !pageRef.current) return
      const rect = pageRef.current.getBoundingClientRect()
      const { clientX, clientY } = getPointFromEvent(e)

      const xScaled = clientX - rect.left - dragState.offsetX
      const yScaled = clientY - rect.top - dragState.offsetY
      const x = Math.round(xScaled / scale)
      const y = Math.round(yScaled / scale)

      const clampedX = Math.max(0, Math.min(x, BASE_WIDTH - 200))
      const clampedY = Math.max(0, y)

      setSignatures((prev) =>
        prev.map((s) =>
          s.id === dragState.sigId ? { ...s, x: clampedX, y: clampedY } : s
        )
      )
    },
    [dragState, scale]
  )

  const handleEnd = async () => {
    if (!dragState) return
    const sig = signatures.find((s) => s.id === dragState.sigId)
    if (sig) {
      try {
        await api.patch(`/signatures/${sig.id}`, {
          x: sig.x,
          y: sig.y,
          page: sig.page,
        })
      } catch (err) {
        console.error('Failed to save position:', err)
      }
    }
    setDragState(null)
  }

  const handleDelete = async (sigId: string) => {
    try {
      await api.delete(`/signatures/${sigId}`)
      setSignatures((prev) => prev.filter((s) => s.id !== sigId))
    } catch (err) {
      console.error('Failed to delete:', err)
    }
  }

  const handleFinalize = async () => {
    if (!window.confirm('Finalize and sign this document? This cannot be undone.')) return
    setFinalizing(true)
    try {
      const res = await api.post(`/signatures/finalize/${id}`)
      setSignedUrl(res.data.data.signedUrl)
      setSignatures((prev) =>
        prev.map((s) => ({ ...s, status: 'SIGNED' as Signature['status'] }))
      )
      alert('Document signed successfully!')
    } catch (err) {
      console.error('Finalize error:', err)
      alert('Failed to sign document.')
    } finally {
      setFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400 text-sm">
        Loading document...
      </div>
    )
  }

  if (!document) {
    return null
  }

  const currentPageSignatures = signatures.filter((s) => s.page === currentPage)

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="bg-white border-b border-gray-200 px-3 sm:px-6 py-3 sticky top-0 z-20 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-500 hover:text-gray-700 text-sm shrink-0"
          >
            Back
          </button>
          <h2 className="font-medium text-gray-900 text-sm truncate min-w-0">
            {document.originalName || 'Untitled Document'}
          </h2>
          <span
            className={
              (document.status === 'SIGNED'
                ? 'bg-green-50 text-green-600'
                : document.status === 'EXPIRED'
                ? 'bg-red-50 text-red-600'
                : 'bg-yellow-50 text-yellow-600') +
              ' text-xs px-2 py-1 rounded-full font-medium shrink-0'
            }
          >
            {document.status}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Prev
            </button>
            <span className="text-xs sm:text-sm text-gray-600 whitespace-nowrap">
              {currentPage} of {numPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages}
              className="text-xs sm:text-sm px-2.5 sm:px-3 py-1 border rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Next
            </button>
          </div>

          {document.status !== 'SIGNED' && (
            <button
              onClick={() => setPlacingMode((prev) => !prev)}
              className={
                (placingMode
                  ? 'bg-yellow-400 text-yellow-900 hover:bg-yellow-500'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700') +
                ' text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-medium whitespace-nowrap'
              }
            >
              {placingMode ? 'Tap PDF to place' : 'Add Signature'}
            </button>
          )}

          {signatures.length > 0 && document.status !== 'SIGNED' && (
            <button
              onClick={handleFinalize}
              disabled={finalizing}
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-medium bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
            >
              {finalizing ? 'Signing...' : 'Finalize and Sign'}
            </button>
          )}

          {document.status === 'SIGNED' && (
            <a
              href={signedUrl || document.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs sm:text-sm px-3 sm:px-4 py-2 rounded-lg font-medium bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm whitespace-nowrap"
            >
              Download
            </a>
          )}
        </div>
      </div>

      {placingMode && (
        <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2 text-center text-xs sm:text-sm text-yellow-700">
          Tap anywhere on the PDF to place your signature box
        </div>
      )}

      {signedUrl && (
        <div className="bg-green-50 border-b border-green-200 px-4 py-3 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-medium text-green-700">
            Document signed successfully!
          </span>
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs sm:text-sm bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 whitespace-nowrap"
          >
            Download Signed PDF
          </a>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full px-2 sm:px-4 py-4 sm:py-8 flex justify-center overflow-x-hidden"
      >
        <div
          ref={pageRef}
          style={{
            width: pdfWidth,
            position: 'relative',
            touchAction: placingMode || dragState ? 'none' : 'pan-y',
          }}
          className={
            (placingMode
              ? 'cursor-crosshair'
              : dragState
              ? 'cursor-grabbing'
              : 'cursor-default') + ' shadow-xl select-none'
          }
          onClick={handlePageClick}
          onMouseMove={handleMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchMove={handleMove}
          onTouchEnd={handleEnd}
        >
          <PDFDocument
            file={document.fileUrl}
            onLoadSuccess={({ numPages }) => setNumPages(numPages)}
            loading={
              <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
                Loading PDF...
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={pdfWidth}
              renderTextLayer={true}
              renderAnnotationLayer={true}
            />
          </PDFDocument>

          {currentPageSignatures.map((sig) => {
            const sigWidth = (sig.width || 200) * scale
            const sigHeight = (sig.height || 60) * scale
            return (
              <div
                key={sig.id}
                onMouseDown={(e) => handleDragStart(e, sig)}
                onTouchStart={(e) => handleDragStart(e, sig)}
                style={{
                  position: 'absolute',
                  left: sig.x * scale,
                  top: sig.y * scale,
                  width: sigWidth,
                  height: sigHeight,
                  zIndex: dragState?.sigId === sig.id ? 50 : 10,
                  cursor: dragState?.sigId === sig.id ? 'grabbing' : 'grab',
                  touchAction: 'none',
                }}
                className={
                  (sig.status === 'SIGNED'
                    ? 'border-green-500 bg-green-50'
                    : 'border-indigo-500 bg-indigo-50') +
                  ' border-2 border-dashed rounded flex items-center justify-center group'
                }
              >
                <span
                  className={
                    (sig.status === 'SIGNED' ? 'text-green-600' : 'text-indigo-600') +
                    ' text-[10px] sm:text-xs font-medium pointer-events-none px-1 text-center'
                  }
                >
                  {sig.status === 'SIGNED' ? 'Signed' : 'Sign here'}
                </span>

                {sig.status !== 'SIGNED' && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDelete(sig.id)
                    }}
                    style={{ position: 'absolute', top: -10, right: -10 }}
                    className="w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center z-50 opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    x
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {signatures.length > 0 && (
        <div className="max-w-3xl mx-auto px-3 sm:px-6 pb-8">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Signature Fields ({signatures.length})
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
            {signatures.map((sig) => (
              <div key={sig.id} className="flex items-center justify-between px-3 sm:px-4 py-3 gap-2">
                <div className="text-xs sm:text-sm text-gray-600 min-w-0">
                  <span className="font-medium">Page {sig.page}</span>
                  <span className="text-gray-400 ml-2">
                    x: {Math.round(sig.x)}, y: {Math.round(sig.y)}
                  </span>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                  <span
                    className={
                      (sig.status === 'SIGNED'
                        ? 'bg-green-50 text-green-600'
                        : 'bg-yellow-50 text-yellow-600') +
                      ' text-xs px-2 py-1 rounded-full font-medium'
                    }
                  >
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
