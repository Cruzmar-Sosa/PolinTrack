'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { Button } from '@/components/ui';
import { FileText, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

interface TraceabilityPdfButtonProps {
  certificateNumber: string;
  downloadEndpoint?: string;
  directUrl?: string;
  fumigationId?: string;
  className?: string;
}

export function TraceabilityPdfButton({
  certificateNumber,
  downloadEndpoint,
  directUrl,
  fumigationId,
  className = '',
}: TraceabilityPdfButtonProps) {
  const { session } = useAuth();
  const token = session?.access_token;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleDownload = async () => {
    // If direct signed URL is already present and valid
    if (directUrl && directUrl.startsWith('http')) {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    // Determine target URL for signed URL retrieval
    let targetUrl: string;
    if (downloadEndpoint) {
      targetUrl = downloadEndpoint.startsWith('http')
        ? downloadEndpoint
        : `${apiUrl.replace(/\/api\/v1$/, '')}${downloadEndpoint.startsWith('/') ? '' : '/'}${downloadEndpoint}`;
    } else if (fumigationId) {
      targetUrl = `${apiUrl}/fumigations/${fumigationId}/certificate-url`;
    } else {
      setErrorMessage('Identificador de certificado no disponible');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch(targetUrl, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      const signedUrl =
        json?.data?.signedUrl ||
        json?.data?.downloadUrl ||
        json?.data?.certificateUrl ||
        json?.signedUrl ||
        json?.downloadUrl ||
        json?.certificateUrl;

      if (signedUrl && typeof signedUrl === 'string') {
        const finalUrl = signedUrl.startsWith('http')
          ? signedUrl
          : `${apiUrl.replace(/\/api\/v1$/, '')}${signedUrl.startsWith('/') ? '' : '/'}${signedUrl}`;
        window.open(finalUrl, '_blank', 'noopener,noreferrer');
      } else {
        throw new Error('URL de certificado no válida');
      }
    } catch (err: any) {
      setErrorMessage('No se pudo recuperar el certificado OIRSA. Contacte al administrador.');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isLoading}
        className={`w-full text-xs font-semibold text-purple-700 bg-purple-50/70 border-purple-200 hover:bg-purple-100 hover:text-purple-900 transition-all flex items-center justify-center gap-1.5 h-8 min-h-[32px] sm:min-h-[36px] ${className}`}
        title={`Ver/Descargar Certificado ${certificateNumber}`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin text-purple-600" />
            <span>Generando enlace seguro...</span>
          </>
        ) : (
          <>
            <FileText className="w-3.5 h-3.5 text-purple-600" />
            <span>Ver Certificado PDF (OIRSA)</span>
          </>
        )}
      </Button>

      {errorMessage && (
        <p className="text-[10px] text-rose-600 font-medium flex items-center gap-1 bg-rose-50 p-1 rounded border border-rose-200">
          <AlertCircle className="w-3 h-3 shrink-0" />
          <span>{errorMessage}</span>
        </p>
      )}
    </div>
  );
}
