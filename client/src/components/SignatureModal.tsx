import React, { useState } from 'react';

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (signatureImageData: string) => void;
  defaultName?: string;
}

const SignatureModal: React.FC<SignatureModalProps> = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  defaultName = '' 
}) => {
  const [typedName, setTypedName] = useState(defaultName);

  if (!isOpen) return null;

  // This function takes the text and converts it to a PNG image!
  const generateSignatureImage = () => {
    if (!typedName.trim()) {
      alert("Please enter a name to sign.");
      return;
    }

    const canvas = document.createElement('canvas');
    // Set standard dimensions for the signature box
    canvas.width = 400;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Create a transparent background
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Use a standard built-in cursive font (looks like handwriting)
      ctx.font = 'italic 56px "Brush Script MT", "Bradley Hand", cursive';
      ctx.fillStyle = '#1e3a8a'; // A professional dark blue ink color
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      
      // Draw the text in the exact center of the canvas
      ctx.fillText(typedName, canvas.width / 2, canvas.height / 2);
    }

    // Convert the canvas to a base64 PNG string
    const base64Image = canvas.toDataURL('image/png');
    
    // Send it back to the parent component to be sent to the API
    onConfirm(base64Image);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-800">Adopt Your Signature</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 cursor-pointer">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Type your full name
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="e.g. Jane Doe"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
            autoFocus
          />

          {/* Live Preview Box */}
          <div className="mt-6 border-2 border-dashed border-gray-200 rounded-xl p-8 bg-gray-50 flex items-center justify-center h-32 relative overflow-hidden">
             <span className="absolute top-2 left-3 text-xs text-gray-400 font-medium tracking-wider">PREVIEW</span>
             {typedName ? (
               <span 
                 style={{ fontFamily: '"Brush Script MT", "Bradley Hand", cursive' }} 
                 className="text-5xl text-blue-900 truncate max-w-full px-4"
               >
                 {typedName}
               </span>
             ) : (
               <span className="text-gray-300 italic">Your signature will appear here</span>
             )}
          </div>
          <p className="text-xs text-gray-500 mt-3 text-center">
            By clicking "Sign Document", you agree that this typed representation constitutes your legal signature.
          </p>
        </div>

        {/* Footer Actions */}
        <div className="bg-gray-50 px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 cursor-pointer"
          >
            Cancel
          </button>
          <button 
            onClick={generateSignatureImage}
            disabled={!typedName.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
          >
            Sign Document
          </button>
        </div>

      </div>
    </div>
  );
};

export default SignatureModal;