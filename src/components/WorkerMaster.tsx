'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Plus, Search, Download, Upload, Edit2, Trash2, Camera, 
  X, Save, AlertCircle, FileSpreadsheet, Users, 
  Image as ImageIcon, CheckCircle2, LayoutGrid, List,
  Building2, CheckSquare, Square, RefreshCw, UserCheck,
  Sparkles, ShieldCheck, AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Sider } from '../types';
import { cn, compressImage } from '../lib/utils';

interface WorkerMasterProps {
  workers: Sider[];
  onDelete: (id: string) => void;
  onUpdate: (worker: Sider) => void;
  onAdd: (worker: Omit<Sider, 'id'>) => void;
  onBulkDelete?: (ids: string[]) => void;
  onImportWorkers?: (imported: Sider[], mode: 'replace' | 'merge') => void;
  currentShed?: string;
}

export const WorkerMaster: React.FC<WorkerMasterProps> = ({
  workers,
  onDelete,
  onUpdate,
  onAdd,
  onBulkDelete,
  onImportWorkers,
  currentShed = 'Shed 1'
}) => {
  const [selectedShedTab, setSelectedShedTab] = useState<string>(currentShed || 'All Sheds');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [photoFilter, setPhotoFilter] = useState<'all' | 'has_photo' | 'no_photo'>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [importMode, setImportMode] = useState<'replace' | 'merge'>('replace');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Sider | null>(null);
  const [formName, setFormName] = useState('');
  const [formTNo, setFormTNo] = useState('');
  const [formShed, setFormShed] = useState<string>(currentShed || 'Shed 1');
  const [formDept, setFormDept] = useState('Sider');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Delete Confirmation Modal
  const [deleteConfirmWorker, setDeleteConfirmWorker] = useState<Sider | null>(null);

  // Hidden file inputs
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const modalPhotoInputRef = useRef<HTMLInputElement>(null);
  const cardPhotoInputRef = useRef<HTMLInputElement>(null);
  const [activeCardPhotoWorkerId, setActiveCardPhotoWorkerId] = useState<string | null>(null);

  // Live Camera Capture Modal State
  const [cameraModalOpen, setCameraModalOpen] = useState(false);
  const [cameraTargetWorkerId, setCameraTargetWorkerId] = useState<'modal' | string | null>(null);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const startCamera = async (target: 'modal' | string) => {
    setCameraTargetWorkerId(target);
    setCapturedImage(null);
    setCameraError(null);
    setCameraModalOpen(true);

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 640 } },
          audio: false
        });
        setCameraStream(stream);
      } else {
        throw new Error('Camera access is not supported by your browser.');
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError(err?.message || 'Unable to access camera. Please allow camera permissions or upload an image file instead.');
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraModalOpen(false);
    setCapturedImage(null);
    setCameraError(null);
  };

  useEffect(() => {
    if (cameraModalOpen && videoRef.current && cameraStream && !capturedImage) {
      videoRef.current.srcObject = cameraStream;
      videoRef.current.play().catch(() => {});
    }
  }, [cameraModalOpen, cameraStream, capturedImage]);

  const capturePhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      setCapturedImage(dataUrl);
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
  };

  const confirmCapturedPhoto = async () => {
    if (!capturedImage) return;
    const compressed = await compressImage(capturedImage, 350, 350, 0.82);

    if (cameraTargetWorkerId === 'modal') {
      setFormPhotoUrl(compressed);
    } else if (cameraTargetWorkerId) {
      const worker = workers.find(w => w.id === cameraTargetWorkerId);
      if (worker) {
        onUpdate({ ...worker, photoUrl: compressed });
      }
    }
    stopCamera();
  };

  // Sync tab with currentShed
  useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Normalize department names consistently
  const normalizeDept = (d?: string): string => {
    if (!d) return 'Sider';
    const trimmed = d.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'sider' || lower === 'siders' || lower === 'operator') return 'Sider';
    if (lower === 'gaiter' || lower === 'gaiters') return 'Gaiter';
    if (lower === 'ai linkconer' || lower === 'linkconer' || lower === 'ai cone' || lower === 'winder') return 'AI Linkconer';
    if (lower === 'fitter' || lower === 'fitters') return 'Fitter';
    if (lower === 'oiler' || lower === 'oilers') return 'Oiler';
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  };

  // Workers scoped to currently selected Shed Tab
  const workersInShedScope = useMemo(() => {
    if (selectedShedTab === 'All Sheds') return workers;
    return workers.filter(w => (w.shed || 'Shed 1') === selectedShedTab);
  }, [workers, selectedShedTab]);

  // Department counts scoped to active shed tab
  const categoriesMap = useMemo(() => {
    const map = new Map<string, number>();
    workersInShedScope.forEach(w => {
      const dept = normalizeDept(w.department);
      map.set(dept, (map.get(dept) || 0) + 1);
    });
    return map;
  }, [workersInShedScope]);

  // Active categories list
  const activeCategories = useMemo(() => {
    const presentCats = new Set<string>();
    workersInShedScope.forEach(w => {
      presentCats.add(normalizeDept(w.department));
    });
    const standard = ['Sider', 'Gaiter', 'AI Linkconer', 'Fitter'];
    return Array.from(new Set([...standard, ...Array.from(presentCats)]));
  }, [workersInShedScope]);

  // Validates if worker has an authentic photo (not dummy picsum or placeholder)
  const isWorkerPhotoValid = (url?: string): boolean => {
    if (!url) return false;
    const trimmed = url.trim();
    if (!trimmed) return false;
    if (trimmed.includes('picsum.photos')) return false;
    if (trimmed.includes('scm-emblem') || trimmed.includes('scm-worker-placeholder') || trimmed.includes('scm-logo')) return false;
    return true;
  };

  const totalWithPhoto = useMemo(() => {
    return workersInShedScope.filter(w => isWorkerPhotoValid(w.photoUrl)).length;
  }, [workersInShedScope]);

  const totalWithoutPhoto = workersInShedScope.length - totalWithPhoto;

  // Filtered list
  const filteredWorkers = useMemo(() => {
    return workersInShedScope.filter(w => {
      // Search query (Name, TNo, Department)
      const q = searchTerm.toLowerCase();
      const matchSearch = 
        w.name.toLowerCase().includes(q) ||
        w.tNo.toLowerCase().includes(q) ||
        (w.department && w.department.toLowerCase().includes(q));
      if (!matchSearch) return false;

      // Category filter
      if (selectedCategory !== 'All') {
        const dept = normalizeDept(w.department);
        if (dept.toLowerCase() !== selectedCategory.toLowerCase()) return false;
      }

      // Photo filter
      const hasPhoto = isWorkerPhotoValid(w.photoUrl);
      if (photoFilter === 'has_photo' && !hasPhoto) return false;
      if (photoFilter === 'no_photo' && hasPhoto) return false;

      return true;
    });
  }, [workersInShedScope, searchTerm, selectedCategory, photoFilter]);

  // Select All handling
  const allFilteredSelected = filteredWorkers.length > 0 && filteredWorkers.every(w => selectedIds.includes(w.id));
  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredWorkers.map(w => w.id));
    }
  };

  const toggleSelectWorker = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  // Add / Edit Modal trigger
  const handleOpenAdd = () => {
    const activeShed = selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1');
    setEditingWorker(null);
    setFormName('');
    setFormTNo('');
    setFormShed(activeShed);
    setFormDept('Sider');
    setFormPhotoUrl('');
    setValidationError(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (worker: Sider) => {
    setEditingWorker(worker);
    setFormName(worker.name);
    setFormTNo(worker.tNo);
    setFormShed(worker.shed || currentShed || 'Shed 1');
    setFormDept(worker.department || 'Sider');
    setFormPhotoUrl(worker.photoUrl || '');
    setValidationError(null);
    setModalOpen(true);
  };

  const handleSaveModal = () => {
    if (!formName.trim() || !formTNo.trim()) {
      setValidationError('Please enter both Employee Name and Ticket Number.');
      return;
    }

    const cleanTNo = formTNo.trim().toUpperCase();
    const cleanShed = formShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1'));

    const duplicate = workers.find(w => 
      w.id !== editingWorker?.id && 
      w.tNo.trim().toUpperCase() === cleanTNo &&
      (w.shed || 'Shed 1') === cleanShed
    );
    if (duplicate) {
      setValidationError(`TK. NO "${cleanTNo}" is already assigned to ${duplicate.name.toUpperCase()} in ${cleanShed}.`);
      return;
    }

    if (editingWorker) {
      onUpdate({
        ...editingWorker,
        name: formName.trim().toUpperCase(),
        tNo: cleanTNo,
        shed: cleanShed,
        department: formDept,
        photoUrl: formPhotoUrl
      });
    } else {
      onAdd({
        name: formName.trim().toUpperCase(),
        tNo: cleanTNo,
        shed: cleanShed,
        department: formDept,
        photoUrl: formPhotoUrl
      });
    }

    setModalOpen(false);
  };

  // Direct Card Photo Upload
  const handleTriggerCardPhoto = (workerId: string) => {
    setActiveCardPhotoWorkerId(workerId);
    cardPhotoInputRef.current?.click();
  };

  const handleCardPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCardPhotoWorkerId) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64, 350, 350, 0.82);
      const worker = workers.find(w => w.id === activeCardPhotoWorkerId);
      if (worker) {
        onUpdate({ ...worker, photoUrl: compressed });
      }
      setActiveCardPhotoWorkerId(null);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Modal Photo Upload
  const handleModalPhotoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64, 350, 350, 0.82);
      setFormPhotoUrl(compressed);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Backup / Exports
  const handleBackupXlsx = () => {
    const data = [
      ['TicketNo', 'Name', 'Department', 'Shed'],
      ...workers.map(w => [w.tNo, w.name, w.department || 'Sider', w.shed || 'Shed 1'])
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, 'Employees_Master_Backup.xlsx');
  };

  const handleBackupJson = () => {
    const jsonStr = JSON.stringify(workers, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Employees_Master_Backup.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import Handler
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      let importedWorkers: Sider[] = [];

      if (file.name.endsWith('.json')) {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) {
          importedWorkers = parsed.map((item, idx) => {
            const rawPhoto = String(item.photoUrl || '').trim();
            const cleanPhoto = rawPhoto.includes('picsum.photos') ? '' : rawPhoto;
            return {
              id: item.id || `imp-${idx}-${Date.now()}`,
              name: String(item.name || '').trim().toUpperCase(),
              tNo: String(item.tNo || item.ticketNo || '').trim().toUpperCase(),
              department: item.department || 'Sider',
              shed: item.shed || currentShed || 'Shed 1',
              photoUrl: cleanPhoto
            };
          }).filter(w => w.name && w.tNo);
        }
      } else {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet) as any[];

        importedWorkers = rows.map((row, idx) => {
          const rawName = row.Name || row.name || row.operator || row.OPERATOR || row.Worker || row.Staff;
          const rawTNo = row.TicketNo || row.tNo || row.t_no || row.ticket || row['t.no'] || row.TNo;
          const rawDept = row.Department || row.department || row.dept || row.DEPT || 'Sider';
          const rawShed = row.Shed || row.shed || currentShed || 'Shed 1';
          const rawPhoto = String(row.PhotoUrl || row.photoUrl || row.Photo || '').trim();
          const cleanPhoto = rawPhoto.includes('picsum.photos') ? '' : rawPhoto;

          return {
            id: `imp-${idx}-${Date.now()}`,
            name: String(rawName || '').trim().toUpperCase(),
            tNo: String(rawTNo || '').trim().toUpperCase(),
            department: String(rawDept || 'Sider').trim(),
            shed: String(rawShed).trim(),
            photoUrl: cleanPhoto
          };
        }).filter(w => w.name && w.tNo);
      }

      if (importedWorkers.length === 0) {
        alert('No valid worker records found in the uploaded file.');
        return;
      }

      if (onImportWorkers) {
        onImportWorkers(importedWorkers, importMode);
      } else {
        importedWorkers.forEach(w => onAdd(w));
      }

      alert(`Successfully imported ${importedWorkers.length} workers in ${importMode} mode!`);
    } catch (err) {
      alert('Failed to parse employee backup file. Please verify the format.');
    } finally {
      e.target.value = '';
    }
  };

  // Bulk Delete
  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    if (window.confirm(`Are you sure you want to permanently delete ${selectedIds.length} selected employee(s)?`)) {
      if (onBulkDelete) {
        onBulkDelete(selectedIds);
      } else {
        selectedIds.forEach(id => onDelete(id));
      }
      setSelectedIds([]);
    }
  };

  const getDeptColor = (dept?: string) => {
    const d = (dept || 'sider').toLowerCase();
    if (d.includes('sider')) return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (d.includes('gaiter')) return 'bg-blue-50 text-blue-800 border-blue-200';
    if (d.includes('ai') || d.includes('coner')) return 'bg-purple-50 text-purple-800 border-purple-200';
    if (d.includes('fitter') || d.includes('maintenance')) return 'bg-amber-50 text-amber-800 border-amber-200';
    return 'bg-stone-100 text-stone-800 border-stone-200';
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 font-sans animate-in fade-in duration-300">
      {/* Hidden Inputs */}
      <input 
        type="file" 
        ref={importFileInputRef} 
        onChange={handleImportFile} 
        accept=".xlsx,.xls,.json" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={cardPhotoInputRef} 
        onChange={handleCardPhotoSelected} 
        accept="image/*" 
        className="hidden" 
      />
      <input 
        type="file" 
        ref={modalPhotoInputRef} 
        onChange={handleModalPhotoSelected} 
        accept="image/*" 
        className="hidden" 
      />

      {/* 1. HERO HEADER */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-600/20 shrink-0">
              <Users size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Staff Registry
                </span>
                <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                  Spinning Operations
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-stone-900 tracking-tight uppercase">
                Employee Master Directory
              </h1>
              <p className="text-xs font-bold text-stone-500 mt-1">
                Manage worker profiles, ticket numbers, shed duty allocations, and photo identification.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle */}
            <div className="inline-flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === 'grid' 
                    ? "bg-white text-stone-900 shadow-2xs" 
                    : "text-stone-500 hover:text-stone-900"
                )}
                title="Cards View"
              >
                <LayoutGrid size={14} />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer",
                  viewMode === 'table' 
                    ? "bg-white text-stone-900 shadow-2xs" 
                    : "text-stone-500 hover:text-stone-900"
                )}
                title="Table View"
              >
                <List size={14} />
                <span>Table</span>
              </button>
            </div>

            {/* Primary Action Button */}
            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer whitespace-nowrap active:scale-95"
            >
              <Plus size={16} />
              <span>Register Employee</span>
            </button>
          </div>
        </div>

        {/* 2. STATS OVERVIEW BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-stone-100">
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block mb-0.5">
              Total Personnel
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-stone-900">
                {workersInShedScope.length}
              </span>
              <span className="text-xs font-bold text-stone-500">
                {selectedShedTab === 'All Sheds' ? 'Registered' : selectedShedTab}
              </span>
            </div>
          </div>

          <div className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-200/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block mb-0.5">
              Photo Verified
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-emerald-800">
                {totalWithPhoto}
              </span>
              <span className="text-xs font-bold text-emerald-600">
                {workersInShedScope.length > 0 ? `${Math.round((totalWithPhoto / workersInShedScope.length) * 100)}%` : '0%'}
              </span>
            </div>
          </div>

          <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block mb-0.5">
              Pending Photos
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-black font-mono text-amber-800">
                {totalWithoutPhoto}
              </span>
              <span className="text-xs font-bold text-amber-600">Needs Snap</span>
            </div>
          </div>

          <div className="bg-purple-50/60 p-4 rounded-2xl border border-purple-200/80">
            <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 block mb-0.5">
              Categories ({selectedShedTab})
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {activeCategories.filter(cat => (categoriesMap.get(cat) || 0) > 0).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === cat ? 'All' : cat)}
                  className={cn(
                    "text-[10px] font-black px-2 py-0.5 rounded-md border transition-all cursor-pointer",
                    selectedCategory === cat
                      ? "bg-purple-700 text-white border-purple-800 shadow-2xs"
                      : "bg-white/80 text-purple-900 border-purple-200 hover:bg-purple-100"
                  )}
                  title={`Filter by ${cat}`}
                >
                  {categoriesMap.get(cat) || 0} {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. SECONDARY UTILITIES TOOLBAR */}
        <div className="mt-5 pt-4 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBackupXlsx}
              className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-900 hover:bg-stone-50 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" />
              <span>Export Excel (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleBackupJson}
              className="px-3.5 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-900 hover:bg-stone-50 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Download size={13} className="text-stone-500" />
              <span>Export JSON (.json)</span>
            </button>

            <span className="text-stone-200 hidden sm:inline">|</span>

            {/* Import Mode Dropdown & Trigger */}
            <div className="flex items-center gap-1.5">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 text-xs focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="replace">Import: Replace Database</option>
                <option value="merge">Import: Merge / Update Existing</option>
              </select>

              <button
                type="button"
                onClick={() => importFileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 hover:bg-emerald-100 font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
              >
                <Upload size={13} className="text-emerald-700" />
                <span>Import Staff</span>
              </button>
            </div>
          </div>

          {/* Bulk delete action */}
          {selectedIds.length > 0 && (
            <button
              type="button"
              onClick={handleBulkDelete}
              className="px-4 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-black flex items-center gap-1.5 transition-all cursor-pointer text-xs"
            >
              <Trash2 size={13} />
              <span>Delete Selected ({selectedIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* 4. FILTERS & SEARCH ROW */}
      <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* SHED TABS */}
          <div className="inline-flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200 overflow-x-auto max-w-full">
            {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => {
              const isSelected = selectedShedTab === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedShedTab(s)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap",
                    isSelected ? "bg-white text-emerald-800 shadow-2xs" : "text-stone-500 hover:text-stone-900"
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>

          {/* SEARCH BAR */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={16} />
            <input
              type="text"
              placeholder="Search by Employee Name, Ticket No, or Department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-stone-50 border border-stone-200 rounded-2xl text-xs font-bold text-stone-900 placeholder-stone-400 focus:bg-white focus:border-emerald-500 outline-none transition-all"
            />
            {searchTerm && (
              <button 
                type="button"
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* PILLS ROW: Category & Photo Status */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-stone-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('All')}
              className={cn(
                "px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer",
                selectedCategory === 'All'
                  ? "bg-stone-900 text-white shadow-2xs"
                  : "bg-stone-100 text-stone-600 hover:text-stone-900"
              )}
            >
              All Categories ({workersInShedScope.length})
            </button>
            {activeCategories.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3 py-1 rounded-xl text-xs font-black transition-all cursor-pointer",
                  selectedCategory === cat
                    ? "bg-stone-900 text-white shadow-2xs"
                    : "bg-stone-100 text-stone-600 hover:text-stone-900"
                )}
              >
                {cat} ({categoriesMap.get(cat) || 0})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPhotoFilter('all')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-[11px] font-black transition-all cursor-pointer",
                  photoFilter === 'all' ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900"
                )}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setPhotoFilter('has_photo')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center gap-1",
                  photoFilter === 'has_photo' ? "bg-emerald-700 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900"
                )}
              >
                <ImageIcon size={11} />
                <span>With Photo ({totalWithPhoto})</span>
              </button>
              <button
                type="button"
                onClick={() => setPhotoFilter('no_photo')}
                className={cn(
                  "px-2.5 py-1 rounded-xl text-[11px] font-black transition-all cursor-pointer flex items-center gap-1",
                  photoFilter === 'no_photo' ? "bg-amber-600 text-white" : "bg-stone-100 text-stone-600 hover:text-stone-900"
                )}
              >
                <span>No Photo ({totalWithoutPhoto})</span>
              </button>
            </div>

            <label className="flex items-center gap-1.5 font-bold text-stone-700 text-xs cursor-pointer select-none ml-2 border-l border-stone-200 pl-3">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="hidden sm:inline">Select All</span>
            </label>
          </div>
        </div>
      </div>

      {/* 5. WORKER CARDS GRID VIEW */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredWorkers.map((worker) => {
            const isSelected = selectedIds.includes(worker.id);
            const hasPhoto = !!(worker.photoUrl && worker.photoUrl.trim() !== '');

            return (
              <div
                key={worker.id}
                className={cn(
                  "bg-white rounded-3xl border p-5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative group",
                  isSelected 
                    ? "border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/10" 
                    : "border-stone-200 hover:border-emerald-200"
                )}
              >
                <div>
                  {/* CARD HEADER: Checkbox + Tags */}
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectWorker(worker.id)}
                      className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />

                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-700 text-[10px] font-black border border-stone-200">
                        {worker.shed || 'Shed 1'}
                      </span>
                      <span className={cn("px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider", getDeptColor(worker.department))}>
                        {worker.department || 'Sider'}
                      </span>
                    </div>
                  </div>

                  {/* AVATAR & NAME BLOCK */}
                  <div className="flex items-center gap-4">
                    {/* PHOTO AVATAR */}
                    <div 
                      onClick={() => handleTriggerCardPhoto(worker.id)}
                      className="w-16 h-16 rounded-2xl border-2 border-stone-200 bg-stone-100 relative overflow-hidden shrink-0 cursor-pointer group/avatar shadow-2xs hover:border-emerald-500 transition-colors"
                      title={hasPhoto ? "Click to change photo" : "Click to upload photo"}
                    >
                      {hasPhoto ? (
                        <img 
                          src={worker.photoUrl} 
                          alt={worker.name} 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-white flex items-center justify-center p-2.5">
                          <img 
                            src="/scm-emblem.png" 
                            alt="Pending Photo" 
                            className="w-full h-full object-contain" 
                          />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-stone-900/60 text-white opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center transition-opacity">
                        <Camera size={18} />
                      </div>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          #{worker.tNo}
                        </span>
                        {hasPhoto ? (
                          <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                            <CheckCircle2 size={11} />
                            Verified
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-amber-600">
                            No Photo
                          </span>
                        )}
                      </div>
                      <h3 className="text-base font-black text-stone-900 uppercase tracking-tight truncate mt-1">
                        {worker.name}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* CARD FOOTER ACTIONS */}
                <div className="mt-4 pt-3 border-t border-stone-100 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startCamera(worker.id)}
                      className="p-1.5 rounded-xl text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="Snap photo with camera"
                    >
                      <Camera size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerCardPhoto(worker.id)}
                      className="p-1.5 rounded-xl text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer"
                      title="Upload photo from disk"
                    >
                      <Upload size={14} />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(worker)}
                      className="px-3 py-1 rounded-xl text-xs font-black text-stone-700 hover:text-stone-950 hover:bg-stone-100 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 size={12} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteConfirmWorker(worker)}
                      className="p-1.5 rounded-xl text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Delete Employee"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {filteredWorkers.length === 0 && (
            <div className="col-span-full py-16 text-center text-stone-400 font-bold text-xs uppercase tracking-wider bg-white rounded-3xl border border-dashed border-stone-200">
              No employees found matching the filter criteria. Click &quot;Register Employee&quot; to add new staff.
            </div>
          )}
        </div>
      )}

      {/* 6. WORKER TABLE VIEW */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 text-[11px] font-black uppercase tracking-wider h-11">
                  <th className="px-4 py-2 w-12 text-center">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-2 w-16">Photo</th>
                  <th className="px-4 py-2 w-28">Ticket No</th>
                  <th className="px-4 py-2">Employee Name</th>
                  <th className="px-4 py-2 w-28">Shed</th>
                  <th className="px-4 py-2 w-36">Category</th>
                  <th className="px-4 py-2 w-32">Status</th>
                  <th className="px-4 py-2 w-36 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-xs font-bold text-stone-800">
                {filteredWorkers.map((worker) => {
                  const isSelected = selectedIds.includes(worker.id);
                  const hasPhoto = isWorkerPhotoValid(worker.photoUrl);

                  return (
                    <tr 
                      key={worker.id} 
                      className={cn(
                        "hover:bg-emerald-50/20 transition-colors h-14",
                        isSelected && "bg-emerald-50/30"
                      )}
                    >
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectWorker(worker.id)}
                          className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div 
                          onClick={() => handleTriggerCardPhoto(worker.id)}
                          className="w-10 h-10 rounded-xl border border-stone-200 bg-white overflow-hidden shrink-0 cursor-pointer hover:border-emerald-500 transition-colors flex items-center justify-center p-1"
                          title={hasPhoto ? "Click to change photo" : "Click to upload photo"}
                        >
                          {hasPhoto ? (
                            <img src={worker.photoUrl} alt={worker.name} className="w-full h-full object-cover" />
                          ) : (
                            <img src="/scm-emblem.png" alt="Pending" className="w-full h-full object-contain" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono font-black text-emerald-700">
                        #{worker.tNo}
                      </td>
                      <td className="px-4 py-2 font-black text-stone-900 uppercase">
                        {worker.name}
                      </td>
                      <td className="px-4 py-2">
                        <span className="px-2.5 py-1 rounded-lg bg-stone-100 text-stone-700 text-[10px] font-black border border-stone-200">
                          {worker.shed || 'Shed 1'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black border uppercase tracking-wider", getDeptColor(worker.department))}>
                          {worker.department || 'Sider'}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        {hasPhoto ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            <CheckCircle2 size={11} /> Verified
                          </span>
                        ) : (
                          <span className="text-[10px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            Missing Photo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => startCamera(worker.id)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Camera"
                          >
                            <Camera size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleTriggerCardPhoto(worker.id)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                            title="Upload"
                          >
                            <Upload size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(worker)}
                            className="p-1.5 rounded-lg text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmWorker(worker)}
                            className="p-1.5 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filteredWorkers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-stone-400 font-bold uppercase tracking-wider text-xs">
                      No staff records found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. ADD / EDIT EMPLOYEE MODAL (NO ASSIGNED MACHINE SECTION) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-lg p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-stone-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="text-base font-black text-stone-900 uppercase tracking-tight">
                    {editingWorker ? 'Edit Employee Details' : 'Register New Employee'}
                  </h2>
                  <p className="text-[11px] font-bold text-stone-400">
                    Personnel profile and spinning unit assignment
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 flex items-center justify-center cursor-pointer transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {validationError && (
              <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0" />
                <span>{validationError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* PHOTO UPLOAD BLOCK */}
              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200 flex items-center gap-4">
                <div className="w-20 h-20 rounded-2xl border-2 border-stone-200 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs relative">
                  {formPhotoUrl && isWorkerPhotoValid(formPhotoUrl) ? (
                    <img src={formPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-white flex items-center justify-center p-3">
                      <img src="/scm-emblem.png" alt="Pending" className="w-full h-full object-contain" />
                    </div>
                  )}
                </div>

                <div className="flex-1 space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-stone-800 block">
                    Employee Identification Photo
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera('modal')}
                      className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
                    >
                      <Camera size={13} className="text-emerald-600" />
                      <span>Take Photo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => modalPhotoInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
                    >
                      <Upload size={13} className="text-stone-500" />
                      <span>Upload File</span>
                    </button>
                    {formPhotoUrl && (
                      <button
                        type="button"
                        onClick={() => setFormPhotoUrl('')}
                        className="px-2 py-1.5 text-red-600 hover:text-red-700 text-xs font-bold"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* FULL NAME */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Employee Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. SENTHIL KUMAR"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none uppercase"
                  autoFocus
                />
              </div>

              {/* TICKET NUMBER & SHED ROW */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                    Ticket Number (T.No) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 104"
                    value={formTNo}
                    onChange={(e) => setFormTNo(e.target.value)}
                    className="w-full px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                    Assigned Shed
                  </label>
                  <select
                    value={formShed}
                    onChange={(e) => setFormShed(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    {['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* CATEGORY (DEPARTMENT) - FULL WIDTH */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Category (Department)
                </label>
                <select
                  value={formDept}
                  onChange={(e) => setFormDept(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                >
                  <option value="Sider">Sider</option>
                  <option value="Gaiter">Gaiter</option>
                  <option value="AI Linkconer">AI Linkconer</option>
                  <option value="Fitter">Fitter</option>
                </select>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="pt-4 border-t border-stone-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-stone-500 hover:text-stone-800 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveModal}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-95"
              >
                <Save size={14} />
                <span>Save Employee Profile</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. SINGLE WORKER DELETE CONFIRMATION MODAL */}
      {deleteConfirmWorker && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-red-200 shadow-2xl max-w-md w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 border border-red-200 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-stone-900 uppercase">
                  Delete Employee?
                </h3>
                <p className="text-xs font-bold text-stone-500 mt-0.5">
                  Permanent removal from staff directory
                </p>
              </div>
            </div>

            <div className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-1">
              <p className="text-sm font-black text-stone-900 uppercase">
                {deleteConfirmWorker.name}
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-stone-500">
                <span>TK #{deleteConfirmWorker.tNo}</span>
                <span>•</span>
                <span>{deleteConfirmWorker.shed || 'Shed 1'}</span>
                <span>•</span>
                <span>{deleteConfirmWorker.department || 'Sider'}</span>
              </div>
            </div>

            <p className="text-xs text-stone-600 font-medium">
              Are you sure you want to permanently delete this employee? Historical performance records will remain archived.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setDeleteConfirmWorker(null)}
                className="px-4 py-2 text-stone-600 font-bold text-xs hover:bg-stone-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(deleteConfirmWorker.id);
                  setDeleteConfirmWorker(null);
                }}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer shadow-sm active:scale-95"
              >
                Delete Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. LIVE CAMERA CAPTURE MODAL */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-emerald-600" />
                <h3 className="text-sm font-black text-stone-900 uppercase">
                  Live Camera Snapshot
                </h3>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="text-stone-400 hover:text-stone-700"
              >
                <X size={16} />
              </button>
            </div>

            {cameraError ? (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs font-bold">
                {cameraError}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="w-full aspect-square bg-stone-900 rounded-2xl overflow-hidden relative border-2 border-stone-200">
                  {capturedImage ? (
                    <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
                  ) : (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>

                <div className="flex items-center justify-center gap-3">
                  {!capturedImage ? (
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
                    >
                      <Camera size={16} />
                      <span>Take Photo</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={retakePhoto}
                        className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 rounded-xl text-xs font-bold cursor-pointer"
                      >
                        Retake
                      </button>
                      <button
                        type="button"
                        onClick={confirmCapturedPhoto}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm cursor-pointer active:scale-95"
                      >
                        <CheckCircle2 size={16} />
                        <span>Confirm &amp; Attach</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
