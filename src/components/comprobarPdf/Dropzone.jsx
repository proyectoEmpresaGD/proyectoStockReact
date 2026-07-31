import React from 'react';
import { FilePlus2, UploadCloud } from 'lucide-react';

export default function Dropzone({ onFiles, accept = 'application/pdf' }) {
    const inputRef = React.useRef(null);
    const [isOver, setIsOver] = React.useState(false);

    const handleFiles = (list) => {
        if (!list) return;
        const files = Array.from(list).filter((file) => !accept || file.type === accept);
        onFiles?.(files);
    };

    const openPicker = () => inputRef.current?.click();

    return (
        <div
            className={`cjm-dropzone ${isOver ? 'is-over' : ''}`}
            onDragOver={(event) => { event.preventDefault(); setIsOver(true); }}
            onDragLeave={() => setIsOver(false)}
            onDrop={(event) => { event.preventDefault(); setIsOver(false); handleFiles(event.dataTransfer.files); }}
            onClick={openPicker}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    openPicker();
                }
            }}
            aria-label="Seleccionar archivos PDF"
        >
            <span className="cjm-icon-tile h-14 w-14 rounded-2xl">
                {isOver ? <FilePlus2 aria-hidden="true" /> : <UploadCloud aria-hidden="true" />}
            </span>
            <p className="mt-4 font-semibold app-text">Arrastra aquí los PDFs</p>
            <p className="cjm-muted mt-1 text-sm">También puedes pulsar para seleccionarlos desde el dispositivo.</p>
            <span className="cjm-badge mt-4">Solo PDF · selección múltiple</span>
            <input
                ref={inputRef}
                type="file"
                accept={accept}
                multiple
                className="sr-only"
                onChange={(event) => handleFiles(event.target.files)}
            />
        </div>
    );
}
