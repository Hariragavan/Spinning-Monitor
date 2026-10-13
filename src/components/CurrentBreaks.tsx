import React, { useState, useEffect } from 'react';
import { Clock, RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import { cn } from '../lib/utils';

interface CurrentBreaksProps {
  isTvMode?: boolean;
  isSidebar?: boolean;
}

export const CurrentBreaks: React.FC<CurrentBreaksProps> = ({ isTvMode = false, isSidebar = false }) => {
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [timer, setTimer] = useState(5);
  const targetUrl = "http://192.168.3.250:81/Unit1/CurrentBreaks.aspx";

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          setLastRefresh(new Date());
          return 5;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  if (isSidebar) {
    return (
      <div className="flex flex-col h-full bg-white border-l border-stone-200">
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-emerald-600" />
            <h3 className="text-[11px] font-black uppercase tracking-widest text-stone-900">Live Breaks</h3>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("w-3 h-3 text-stone-400", timer === 5 && "animate-spin")} />
            <span className="text-[10px] font-bold text-stone-400 tabular-nums">{timer}s</span>
          </div>
        </div>
        <div className="flex-1 w-full bg-stone-50 relative group">
          <iframe 
            key={lastRefresh.getTime()}
            src={targetUrl}
            className={cn(
              "w-full h-full border-0 transition-all duration-700",
              !isTvMode && "grayscale hover:grayscale-0"
            )}
            title="Sidebar Breaks Monitor"
          />
          {!isTvMode && (
            <div className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-stone-900/10 backdrop-blur-sm px-2 py-1 rounded text-[8px] font-bold text-stone-600 uppercase"> Mill Network Required </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn(
      "flex flex-col h-full space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500",
      isTvMode && "fixed inset-0 z-[100] bg-stone-50 p-0 m-0 space-y-0"
    )}>
      {/* Header */}
      {!isTvMode && (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-3xl font-black text-stone-900 tracking-tighter uppercase flex items-center gap-3">
              <Clock className="w-8 h-8 text-emerald-600" />
              Current Breaks
            </h2>
            <p className="text-xs text-stone-400 font-bold uppercase tracking-[0.2em] mt-1">Live monitored machine status</p>
          </div>
          <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-2xl border border-stone-200 shadow-sm">
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("w-4 h-4 text-emerald-600", timer === 5 && "animate-spin")} />
              <span className="text-xs font-black text-stone-600 uppercase tracking-widest">Refreshing in {timer}s</span>
            </div>
            <div className="h-4 w-[1px] bg-stone-200" />
            <span className="text-[10px] font-bold text-stone-400 uppercase">Last Update: {lastRefresh.toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className={cn(
        "flex-1 bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden flex flex-col relative",
        isTvMode && "rounded-0 border-0"
      )}>
        {isTvMode && (
          <div className="absolute top-4 right-4 z-50 flex items-center gap-4 bg-black/50 backdrop-blur-md px-4 py-2 rounded-full text-white border border-white/10">
            <RefreshCw className={cn("w-4 h-4", timer === 5 && "animate-spin")} />
            <span className="text-sm font-black tracking-tighter uppercase">Live: {timer}s</span>
          </div>
        )}

        <div className="flex-1 w-full bg-stone-100 relative">
          <iframe 
            key={lastRefresh.getTime()} // Key change forces iframe reload
            src={targetUrl}
            className="w-full h-full border-0"
            title="Current Breaks Monitor"
            sandbox="allow-same-origin allow-scripts"
          />
          
          {/* Overlay info if it fails to load due to local network constraints */}
          {!isTvMode && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 backdrop-blur-sm p-4 rounded-2xl border border-stone-200 shadow-xl max-w-md w-full text-center">
              <div className="flex items-center justify-center gap-2 text-stone-400 mb-1">
                <AlertCircle className="w-4 h-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Network Notice</span>
              </div>
              <p className="text-xs text-stone-600 font-medium">
                This monitor connects to an internal IP (192.168.3.250). Ensure you are connected to the mill network to view live data.
              </p>
              <a 
                href={targetUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-2 text-[11px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
              >
                Open in new tab <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
