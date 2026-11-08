import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldAlert, ExternalLink, RefreshCw, X, Lock } from 'lucide-react';
import { AuthInterceptError } from '../types/dufs';
import { useModalTransition } from '../utils/useModalTransition';

interface AuthPromptModalProps {
  authError: AuthInterceptError | null;
  loginUrl: string;
  onClose: () => void;
  onSimulateLoginSuccess?: () => void;
  onLoginSuccess?: () => void;
  isDemoMode: boolean;
}

export const AuthPromptModal: React.FC<AuthPromptModalProps> = ({
  authError,
  loginUrl,
  onClose,
  onSimulateLoginSuccess,
  onLoginSuccess,
  isDemoMode,
}) => {
  const { t } = useTranslation();
  const { rendered, isClosing } = useModalTransition(!!authError, 160);
  const [cachedError, setCachedError] = useState<AuthInterceptError | null>(authError);

  useEffect(() => {
    if (authError) setCachedError(authError);
  }, [authError]);

  if (!rendered || !cachedError) return null;

  const actionLabel =
    cachedError.operation === 'upload'
      ? t('auth.operationUpload')
      : cachedError.operation === 'mkdir'
      ? t('auth.operationMkdir')
      : t('auth.operationDelete');

  const resolvedLoginHref = cachedError.redirectUrl || loginUrl || '/';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md ${
        isClosing ? 'animate-fadeOut' : 'animate-fadeIn'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden ${
          isClosing ? 'animate-modalOut' : 'animate-modalIn'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Accent Banner */}
        <div className="p-6 pb-5 bg-gradient-to-br from-amber-500/10 via-indigo-500/5 to-transparent border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/30 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300">
                  <Lock className="w-3 h-3" />
                  {t('auth.modalBadge')}
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                  {t('auth.modalTitle')}
                </h3>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 active:scale-90 transition-transform"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mt-3.5 leading-relaxed">
            {t('auth.modalDesc', {
              action: actionLabel,
              status: cachedError.status,
            })}
          </p>
        </div>

        {/* Gateway Diagnostic Info */}
        <div className="p-6 space-y-4">
          <div className="p-3.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-1.5">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>{t('auth.gatewayLabel')}</span>
              <span className="font-mono font-semibold text-amber-600 dark:text-amber-400">
                HTTP {cachedError.status}
              </span>
            </div>
            <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 truncate">
              Target: {cachedError.targetPath}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('auth.gatewayDetail', { status: cachedError.status })}
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            {isDemoMode && onSimulateLoginSuccess ? (
              <button
                type="button"
                onClick={onSimulateLoginSuccess}
                className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t('auth.retryAfterLogin')}</span>
              </button>
            ) : (
              <a
                href={resolvedLoginHref}
                className="w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-500/20 flex items-center justify-center gap-2 active:scale-95 transition-all"
              >
                <ExternalLink className="w-4 h-4" />
                <span>{t('auth.loginRedirectBtn')}</span>
              </a>
            )}

            {!isDemoMode && onLoginSuccess && (
              <button
                type="button"
                onClick={() => {
                  onLoginSuccess();
                  onClose();
                }}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('auth.recheckBtn')}</span>
              </button>
            )}

            {cachedError.retryCallback && !isDemoMode && (
              <button
                type="button"
                onClick={() => {
                  const cb = cachedError.retryCallback;
                  onClose();
                  cb?.();
                }}
                className="w-full py-2 px-4 rounded-xl text-xs font-medium bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 active:scale-95 transition-all"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>{t('auth.retryAfterLogin')}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 px-4 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 active:scale-95 transition-all"
            >
              {t('auth.closeBtn')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
