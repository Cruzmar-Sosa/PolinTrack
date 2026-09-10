'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Lock, Mail, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If user is already authenticated, redirect to /dashboard immediately (Section 14)
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Field-level validations (Section 25)
    if (!cleanEmail) {
      setErrorMessage('Por favor ingrese su correo electrónico institucional.');
      return;
    }

    if (!emailRegex.test(cleanEmail)) {
      setErrorMessage('El formato del correo electrónico no es válido.');
      return;
    }

    if (!password) {
      setErrorMessage('Por favor ingrese su contraseña.');
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await login(cleanEmail, password);

      if (result.success) {
        router.push('/dashboard');
      } else {
        setErrorMessage(
          result.error ||
            'Correo electrónico o contraseña incorrectos. Verifique sus datos o contacte al Administrador',
        );
      }
    } catch {
      setErrorMessage(
        'Ocurrió un error inesperado al procesar la solicitud. Intente nuevamente.',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="min-h-screen bg-canvas flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Main Authentication Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden">
          {/* Header & Product Branding */}
          <div className="p-8 pb-6 text-center border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
            <div className="flex justify-center mb-4">
              <div className="relative w-48 h-12">
                <Image
                  src="/images/polintrack_logo.png"
                  alt="PolinTrack"
                  fill
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <h1 className="text-xl font-bold text-navy tracking-tight">
              Control de Acceso Operativo
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Sistema de Gestión y Trazabilidad de Polines
            </p>
          </div>

          {/* Form Content */}
          <div className="p-8 pt-6">
            {/* Error Alert Box */}
            {errorMessage && (
              <div
                role="alert"
                className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs animate-in fade-in duration-200"
              >
                <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1 font-medium leading-relaxed">
                  {errorMessage}
                </div>
              </div>
            )}

            <form noValidate onSubmit={handleSubmit} className="space-y-5">
              {/* Email Input */}
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2"
                >
                  Correo Institucional
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="usuario@polintrack.com"
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label
                    htmlFor="password"
                    className="block text-xs font-semibold text-slate-700 uppercase tracking-wider"
                  >
                    Contraseña
                  </label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    disabled={isSubmitting}
                    className="w-full pl-10 pr-11 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-action focus:border-transparent transition-all disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Options */}
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer select-none text-slate-600">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-action focus:ring-action"
                  />
                  <span>Recordar sesión en este equipo</span>
                </label>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 px-4 bg-action hover:bg-action-hover active:bg-blue-800 text-white text-sm font-semibold rounded-lg shadow-md hover:shadow-lg transition-all duration-150 flex justify-center items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Verificando credenciales...</span>
                  </>
                ) : (
                  <span>Iniciar Sesión</span>
                )}
              </button>
            </form>
          </div>

          {/* Institutional Secondary Branding Footer */}
          <div className="bg-slate-50/80 px-8 py-4 border-t border-slate-100 text-center">
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-widest mb-2">
              Instalación autorizada para:
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <div className="relative w-8 h-8 rounded overflow-hidden shadow-sm border border-slate-200">
                <Image
                  src="/images/empresa_logo.jpg"
                  alt="Venta de Madera y Pallet"
                  fill
                  className="object-cover"
                />
              </div>
              <span className="text-xs font-bold text-enterprise tracking-tight">
                Venta de Madera y Pallet
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Planta Principal de Aserrío y Tratamiento Fitosanitario
            </p>
          </div>
        </div>

        {/* Security & System Info Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <p>PolinTrack v1.0.0 • Entorno de Operaciones Seguras</p>
          <p className="text-[10px] text-slate-400/80 mt-1">
            Acceso restringido exclusivamente a personal autorizado. Todas las operaciones son auditadas.
          </p>
        </div>
      </div>
    </main>
  );
}
