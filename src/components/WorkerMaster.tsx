import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Search, Download, Upload, Edit2, Trash2, Camera, 
  X, Save, AlertCircle, FileSpreadsheet, Code, CheckSquare, 
  Square, Users, Image as ImageIcon, CheckCircle2, RefreshCw 
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

  // Modal State for Add / Edit
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Sider | null>(null);
  const [formName, setFormName] = useState('');
  const [formTNo, setFormTNo] = useState('');
  const [formShed, setFormShed] = useState<string>(currentShed || 'Shed 1');
  const [formDept, setFormDept] = useState('Gaiter');
  const [formMachine, setFormMachine] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

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
  React.useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);


  // Calculate distinct categories
  const categoriesMap = new Map<string, number>();
  workers.forEach(w => {
    const dept = (w.department || 'Sider').trim();
    categoriesMap.set(dept, (categoriesMap.get(dept) || 0) + 1);
  });

  const totalWithPhoto = workers.filter(w => !!(w.photoUrl && w.photoUrl.trim() !== '')).length;
  const totalWithoutPhoto = workers.filter(w => !(w.photoUrl && w.photoUrl.trim() !== '')).length;

  // Filtered list
  const filteredWorkers = workers.filter(w => {
    // Shed filter
    if (selectedShedTab !== 'All Sheds') {
      const wShed = w.shed || 'Shed 1';
      if (wShed !== selectedShedTab) return false;
    }

    // Search query
    const matchSearch = 
      w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      w.tNo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (w.department && w.department.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (w.assignedMachine && w.assignedMachine.toLowerCase().includes(searchTerm.toLowerCase()));
    if (!matchSearch) return false;

    // Category filter
    if (selectedCategory !== 'All') {
      const dept = (w.department || 'Sider').toLowerCase();
      if (dept !== selectedCategory.toLowerCase()) return false;
    }

    // Photo filter
    const hasPhoto = !!(w.photoUrl && w.photoUrl.trim() !== '');
    if (photoFilter === 'has_photo' && !hasPhoto) return false;
    if (photoFilter === 'no_photo' && hasPhoto) return false;

    return true;
  });

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
    setFormMachine('');
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
    setFormMachine(worker.assignedMachine || '');
    setFormPhotoUrl(worker.photoUrl || '');
    setValidationError(null);
    setModalOpen(true);
  };

  const handleSaveModal = () => {
    if (!formName.trim() || !formTNo.trim()) {
      setValidationError('Please enter both Worker Name and Ticket Number.');
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
        assignedMachine: formMachine.trim().toUpperCase(),
        photoUrl: formPhotoUrl
      });
    } else {
      onAdd({
        name: formName.trim().toUpperCase(),
        tNo: cleanTNo,
        shed: cleanShed,
        department: formDept,
        assignedMachine: formMachine.trim().toUpperCase(),
        photoUrl: formPhotoUrl
      });
    }

    setModalOpen(false);
  };

  // Card Direct Photo Upload
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
  const handleModalPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      const rawBase64 = reader.result as string;
      const compressed = await compressImage(rawBase64, 350, 350, 0.82);
      setFormPhotoUrl(compressed);
    };
    reader.readAsDataURL(file);
  };

  // Backup / Exports
  const handleBackupXlsx = () => {
    const data = [
      ['TicketNo', 'Name', 'Department', 'AssignedMachine'],
      ...workers.map(w => [w.tNo, w.name, w.department || 'Sider', w.assignedMachine || ''])
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
          importedWorkers = parsed.map((item, idx) => ({
            id: item.id || `imp-${idx}-${Date.now()}`,
            name: String(item.name || '').trim().toUpperCase(),
            tNo: String(item.tNo || item.ticketNo || '').trim().toUpperCase(),
            department: item.department || 'Gaiter',
            assignedMachine: item.assignedMachine || 'SP023',
            photoUrl: item.photoUrl || ''
          })).filter(w => w.name && w.tNo);
        }
      } else {
        // Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet) as any[];

        importedWorkers = rows.map((row, idx) => {
          const rawName = row.Name || row.name || row.operator || row.OPERATOR || row.Worker || row.Staff;
          const rawTNo = row.TicketNo || row.tNo || row.t_no || row.ticket || row['t.no'] || row.TNo;
          const rawDept = row.Department || row.department || row.dept || row.DEPT || 'Gaiter';
          const rawMachine = row.AssignedMachine || row.assignedMachine || row.machine || row.MC || 'SP023';

          return {
            id: `imp-${idx}-${Date.now()}`,
            name: String(rawName || '').trim().toUpperCase(),
            tNo: String(rawTNo || '').trim().toUpperCase(),
            department: String(rawDept || 'Gaiter').trim(),
            assignedMachine: String(rawMachine || 'SP023').trim().toUpperCase(),
            photoUrl: row.PhotoUrl || row.photoUrl || ''
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
        // Fallback: apply imported workers
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

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
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

      {/* TOP HEADER CARD */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* TITLE & SUBTITLE */}
          <div className="flex items-start gap-3">
            <div className="w-1.5 h-8 bg-emerald-600 rounded-full shrink-0 mt-0.5" />
            <div>
              <h1 className="text-xl font-black text-stone-900 uppercase tracking-tight">
                EMPLOYEE MASTER (WORKER DIRECTORY)
              </h1>
              <p className="text-xs font-semibold text-stone-400 mt-0.5">
                Manage Employee Name, Ticket No (T.No), Category (Sider / Gaiter / Fitter / AI Linkconer) &amp; Shed Assignment
              </p>
            </div>
          </div>

          {/* SHED TABS & SEARCH & ADD BUTTON */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* SHED FILTER BAR */}
            <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
              {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => {
                const isSelected = selectedShedTab === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSelectedShedTab(s)}
                    className={cn(
                      "px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                      isSelected ? "bg-white text-emerald-800 shadow-xs font-black" : "text-stone-500 hover:text-stone-800"
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="relative min-w-[220px]">

              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" size={15} />
              <input
                type="text"
                placeholder="Search by Name or Ticket No..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            <button
              type="button"
              onClick={handleOpenAdd}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus size={15} />
              <span>+ ADD NEW WORKER</span>
            </button>
          </div>
        </div>

        {/* SECONDARY ACTION TOOLBAR */}
        <div className="mt-4 pt-4 border-t border-stone-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleBackupXlsx}
              className="px-3 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-950 hover:bg-stone-50 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet size={13} className="text-emerald-600" />
              <span>Backup Employees (.xlsx)</span>
            </button>

            <button
              type="button"
              onClick={handleBackupJson}
              className="px-3 py-1.5 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-950 hover:bg-stone-50 font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Download size={13} className="text-stone-500" />
              <span>Backup Employees (.json)</span>
            </button>

            <span className="text-stone-300 font-light hidden sm:inline">|</span>

            {/* IMPORT MODE DROPDOWN */}
            <div className="flex items-center gap-1.5">
              <select
                value={importMode}
                onChange={(e) => setImportMode(e.target.value as 'replace' | 'merge')}
                className="px-3 py-1.5 bg-stone-50 border border-stone-200 rounded-xl font-bold text-stone-700 text-xs focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
              >
                <option value="replace">Import Mode: Replace All Employees</option>
                <option value="merge">Import Mode: Merge / Update Existing</option>
              </select>
            </div>

            {/* IMPORT BUTTON */}
            <button
              type="button"
              onClick={() => importFileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-xl bg-emerald-50/70 border border-emerald-300 text-emerald-800 hover:bg-emerald-100 font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs"
            >
              <Upload size={13} className="text-emerald-700" />
              <span>Import Employees (.xlsx / .json)</span>
            </button>
          </div>

          {/* SELECT ALL & BULK ACTIONS */}
          <div className="flex items-center gap-3">
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={handleBulkDelete}
                className="px-3 py-1.5 rounded-xl bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 font-black flex items-center gap-1.5 transition-all cursor-pointer text-xs"
              >
                <Trash2 size={13} />
                <span>Delete Selected ({selectedIds.length})</span>
              </button>
            )}

            <label className="flex items-center gap-1.5 font-bold text-stone-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span>Select All ({filteredWorkers.length})</span>
            </label>
          </div>
        </div>
      </div>

      {/* FILTER PILLS BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 py-1">
        {/* CATEGORY PILLS (LEFT) */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('All')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
              selectedCategory === 'All'
                ? "bg-white text-stone-900 border border-stone-300 shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            All Categories ({workers.length})
          </button>

          {/* Sider button */}
          <button
            type="button"
            onClick={() => setSelectedCategory('Sider')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
              selectedCategory === 'Sider'
                ? "bg-white text-stone-900 border border-stone-300 shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            Sider ({categoriesMap.get('Sider') || 0})
          </button>

          {/* Gaiter button */}
          <button
            type="button"
            onClick={() => setSelectedCategory('Gaiter')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
              selectedCategory === 'Gaiter'
                ? "bg-white text-stone-900 border border-stone-300 shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            Gaiter ({categoriesMap.get('Gaiter') || 0})
          </button>

          {/* Other departments if any */}
          {Array.from(categoriesMap.keys())
            .filter(d => d !== 'Sider' && d !== 'Gaiter')
            .map(dept => (
              <button
                key={dept}
                type="button"
                onClick={() => setSelectedCategory(dept)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
                  selectedCategory === dept
                    ? "bg-white text-stone-900 border border-stone-300 shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
                )}
              >
                {dept} ({categoriesMap.get(dept)})
              </button>
            ))}
        </div>

        {/* PHOTO STATUS PILLS (RIGHT) */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto">
          <button
            type="button"
            onClick={() => setPhotoFilter('all')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer",
              photoFilter === 'all'
                ? "bg-stone-900 text-white shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            All Persons
          </button>

          <button
            type="button"
            onClick={() => setPhotoFilter('has_photo')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1",
              photoFilter === 'has_photo'
                ? "bg-stone-900 text-white shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            <ImageIcon size={13} />
            <span>Photo Added Person ({totalWithPhoto})</span>
          </button>

          <button
            type="button"
            onClick={() => setPhotoFilter('no_photo')}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1",
              photoFilter === 'no_photo'
                ? "bg-stone-900 text-white shadow-2xs"
                : "text-stone-600 hover:text-stone-900 hover:bg-stone-100/70"
            )}
          >
            <Users size={13} />
            <span>Not Photo Added Person ({totalWithoutPhoto})</span>
          </button>
        </div>
      </div>

      {/* WORKER CARDS GRID (3 COLUMNS) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredWorkers.map((worker) => {
          const isSelected = selectedIds.includes(worker.id);
          const hasPhoto = !!(worker.photoUrl && worker.photoUrl.trim() !== '');

          return (
            <div
              key={worker.id}
              className={cn(
                "bg-white rounded-2xl border p-4 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between relative",
                isSelected ? "border-emerald-500 bg-emerald-50/10" : "border-stone-200/90"
              )}
            >
              {/* CARD TOP INFO */}
              <div className="flex items-start gap-3">
                {/* SELECT CHECKBOX */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelectWorker(worker.id)}
                  className="w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer mt-1"
                />

                {/* PHOTO THUMBNAIL / ADD PHOTO BOX */}
                <div
                  onClick={() => handleTriggerCardPhoto(worker.id)}
                  className="w-14 h-14 rounded-xl border border-dashed border-stone-300 bg-stone-50 hover:bg-stone-100 transition-colors flex flex-col items-center justify-center text-center shrink-0 cursor-pointer overflow-hidden relative group"
                  title={hasPhoto ? "Click to change photo" : "Click to upload photo"}
                >
                  {hasPhoto ? (
                    <>
                      <img 
                        src={worker.photoUrl} 
                        alt={worker.name} 
                        className="w-full h-full object-cover rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
                        <Camera size={16} />
                      </div>
                    </>
                  ) : (
                    <>
                      <Camera size={16} className="text-stone-400 group-hover:text-stone-600 transition-colors" />
                      <span className="text-[8px] font-black uppercase text-stone-400 group-hover:text-stone-600 mt-0.5 tracking-wider">
                        ADD PHOTO
                      </span>
                    </>
                  )}
                </div>

                {/* DETAILS */}
                <div className="min-w-0 flex-1">
                  {/* TAGS LINE */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-black uppercase">
                    <span className="text-emerald-600 font-mono">
                      TK. NO {worker.tNo}
                    </span>
                    <span>•</span>
                    <span className="px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-700 text-[10px] font-bold border border-stone-200">
                      {worker.shed || 'Shed 1'}
                    </span>
                    <span>•</span>
                    <span className="text-purple-600">
                      DEPT {worker.department || 'SIDER'}
                    </span>
                    <span>•</span>
                    <span className="text-stone-400 font-mono">
                      {worker.assignedMachine || '-'}
                    </span>
                  </div>

                  {/* WORKER NAME */}
                  <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight truncate mt-1">
                    {worker.name}
                  </h3>

                  {/* PHOTO ACTION BUTTONS */}
                  <div className="flex items-center gap-1.5 mt-2">
                    <button 
                      type="button"
                      onClick={() => startCamera(worker.id)}
                      className="px-2 py-0.5 bg-stone-100 hover:bg-emerald-50 text-stone-700 hover:text-emerald-700 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-stone-200 cursor-pointer transition-all active:scale-95"
                      title="Capture photo from camera"
                    >
                      <Camera size={11} className="text-emerald-600" />
                      <span>Camera</span>
                    </button>
                    <button 
                      type="button"
                      onClick={() => handleTriggerCardPhoto(worker.id)}
                      className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-md text-[10px] font-black uppercase tracking-wider flex items-center gap-1 border border-stone-200 cursor-pointer transition-all active:scale-95"
                      title="Upload image file"
                    >
                      <Upload size={11} className="text-stone-500" />
                      <span>Upload</span>
                    </button>
                    {hasPhoto && (
                      <span className="text-[9px] text-emerald-600 font-bold ml-0.5">✓ Photo</span>
                    )}
                  </div>
                </div>
              </div>

              {/* CARD BOTTOM ACTIONS */}
              <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between text-xs font-bold">
                <button
                  type="button"
                  onClick={() => handleOpenEdit(worker)}
                  className="flex items-center gap-1 text-stone-600 hover:text-emerald-700 transition-colors cursor-pointer"
                >
                  <Edit2 size={13} />
                  <span>Edit Name / T.No / Dept</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete worker ${worker.name} (${worker.tNo})?`)) {
                      onDelete(worker.id);
                    }
                  }}
                  className="flex items-center gap-1 text-red-500 hover:text-red-700 transition-colors cursor-pointer"
                >
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          );
        })}

        {filteredWorkers.length === 0 && (
          <div className="col-span-full py-16 text-center text-stone-400 font-bold text-xs uppercase tracking-wider bg-white rounded-2xl border border-dashed border-stone-200">
            No employees found matching the active filter criteria. Click &quot;+ ADD NEW WORKER&quot; to register new employees.
          </div>
        )}
      </div>

      {/* ADD / EDIT WORKER MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-lg p-6 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <h2 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
                <Users size={16} className="text-emerald-600" />
                {editingWorker ? 'Edit Employee Details' : 'Add New Employee'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {validationError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2">
                <AlertCircle size={15} />
                <span>{validationError}</span>
              </div>
            )}

            <div className="space-y-4">
              {/* PHOTO UPLOAD BLOCK */}
              <div className="flex items-center gap-4 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                <div className="w-16 h-16 rounded-xl border border-dashed border-stone-300 bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-2xs">
                  {formPhotoUrl ? (
                    <img src={formPhotoUrl} alt="Preview" className="w-full h-full object-cover" />
                  ) : (
                    <Camera size={22} className="text-stone-300" />
                  )}
                </div>
                <div className="flex-1">
                  <span className="block text-xs font-bold text-stone-700 mb-1.5">Employee Photo</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startCamera('modal')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Camera size={13} />
                      <span>Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => modalPhotoInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-700 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer active:scale-95"
                    >
                      <Upload size={13} />
                      <span>Upload Image</span>
                    </button>

                    {formPhotoUrl && (
                      <button
                        type="button"
                        onClick={() => setFormPhotoUrl('')}
                        className="text-xs text-red-500 hover:text-red-700 font-bold ml-1 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={modalPhotoInputRef}
                    onChange={handleModalPhotoUpload}
                    accept="image/*"
                    className="hidden"
                  />
                </div>
              </div>

              {/* NAME */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Worker Name *
                </label>
                <input
                  type="text"
                  placeholder="e.g. AMARESH PANDA"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 placeholder-stone-400 focus:bg-white focus:border-emerald-500 outline-none uppercase"
                />
              </div>

              {/* TICKET NUMBER */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Ticket Number (T.No) *
                </label>
                <input
                  type="text"
                  placeholder="e.g. 101, 201, 301, 401"
                  value={formTNo}
                  onChange={(e) => setFormTNo(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 placeholder-stone-400 focus:bg-white focus:border-emerald-500 outline-none uppercase"
                />
              </div>

              {/* SHED / UNIT SELECTOR */}
              <div>
                <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                  Shed / Unit Assignment *
                </label>
                <select
                  value={formShed}
                  onChange={(e) => {
                    setFormShed(e.target.value);
                  }}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                >
                  {['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* CATEGORY & ASSIGNED MACHINE */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                    Category (Department)
                  </label>
                  <select
                    value={formDept}
                    onChange={(e) => setFormDept(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="Gaiter">Gaiter</option>
                    <option value="Sider">Sider</option>
                    <option value="AI Linkconer">AI Linkconer</option>
                    <option value="Fitter">Fitter</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                    Assigned Machine
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 01"
                    value={formMachine}
                    onChange={(e) => setFormMachine(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none uppercase"
                  />
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
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
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Save size={14} />
                <span>Save Employee</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LIVE CAMERA CAPTURE MODAL */}
      {cameraModalOpen && (
        <div className="fixed inset-0 z-[60] bg-stone-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 border-b border-stone-100 bg-stone-50">
              <div className="flex items-center gap-2">
                <Camera size={18} className="text-emerald-600" />
                <h3 className="text-sm font-black text-stone-900 uppercase tracking-wider">
                  Capture Worker Photo
                </h3>
              </div>
              <button
                type="button"
                onClick={stopCamera}
                className="text-stone-400 hover:text-stone-700 p-1 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex flex-col items-center">
              {cameraError ? (
                <div className="p-6 text-center space-y-3">
                  <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
                    <AlertCircle size={24} />
                  </div>
                  <p className="text-xs font-bold text-red-700 leading-relaxed">{cameraError}</p>
                  <p className="text-[11px] text-stone-500 font-medium">You can still upload photos from your device using the &quot;Upload Image&quot; button.</p>
                </div>
              ) : (
                <div className="relative w-full aspect-square max-w-[320px] rounded-2xl overflow-hidden bg-stone-950 border-2 border-stone-800 shadow-inner flex items-center justify-center">
                  {!capturedImage ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover mirror"
                      />
                      {/* Viewfinder circle guide */}
                      <div className="absolute inset-4 border-2 border-dashed border-white/40 rounded-full pointer-events-none" />
                    </>
                  ) : (
                    <img 
                      src={capturedImage} 
                      alt="Captured snapshot" 
                      className="w-full h-full object-cover" 
                    />
                  )}
                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {/* Camera Actions */}
              {!cameraError && (
                <div className="mt-5 w-full flex items-center justify-center gap-3">
                  {!capturedImage ? (
                    <button
                      type="button"
                      onClick={capturePhoto}
                      className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg shadow-emerald-600/30 flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
                    >
                      <Camera size={16} />
                      <span>Capture Photo</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={retakePhoto}
                        className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
                      >
                        <RefreshCw size={14} />
                        <span>Retake</span>
                      </button>
                      <button
                        type="button"
                        onClick={confirmCapturedPhoto}
                        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-xs uppercase tracking-wider shadow-md flex items-center gap-1.5 cursor-pointer"
                      >
                        <CheckCircle2 size={15} />
                        <span>Confirm &amp; Use</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="p-3 bg-stone-50 border-t border-stone-100 text-center">
              <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">
                Hold face centered inside the frame • Good lighting recommended
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
