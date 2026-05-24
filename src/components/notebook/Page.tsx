import React, { useEffect, useRef } from 'react';

type PageProps = {
  id: string;
  html: string;
  onChange: (id: string, html: string) => void;
  className?: string;
};

export default function Page({ id, html, onChange, className }: PageProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== html) {
      ref.current.innerHTML = html;
    }
  }, [html]);

  return (
    <div
      id={id}
      className={`notebook-page relative bg-white rounded-lg shadow-md mx-auto my-6 p-8 w-[210mm] max-w-full ${className || ''}`}
      style={{
        minHeight: '297mm',
        boxShadow: '0 8px 20px rgba(0,0,0,0.08)'
      }}
    >
      <div className="page-lines absolute inset-0 pointer-events-none" />

      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={() => onChange(id, ref.current?.innerHTML || '')}
        className="prose max-w-none min-h-[100px] relative z-10"
        style={{ outline: 'none' }}
      />
    </div>
  );
}
