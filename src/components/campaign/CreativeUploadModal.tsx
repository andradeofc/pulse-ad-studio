import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, File, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { uploadCreative, CreativeMetadata, UploadProgress } from '@/services/creativesService';
import { cn } from '@/lib/utils';

interface CreativeUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: (creatives: CreativeMetadata[]) => void;
}

const ACCEPTED_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/gif': ['.gif'],
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/webm': ['.webm'],
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function CreativeUploadModal({
  open,
  onOpenChange,
  onUploadComplete,
}: CreativeUploadModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({});
  const [isUploading, setIsUploading] = useState(false);

  const validateFile = (file: File): string | null => {
    if (!Object.keys(ACCEPTED_TYPES).includes(file.type)) {
      return `Tipo de arquivo não suportado: ${file.type}`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `Arquivo muito grande. Máximo: 100MB`;
    }
    return null;
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
    }
  };

  const addFiles = (newFiles: File[]) => {
    const validFiles: File[] = [];
    const newProgress: Record<string, UploadProgress> = {};

    newFiles.forEach((file) => {
      const error = validateFile(file);
      if (error) {
        newProgress[file.name] = {
          fileName: file.name,
          progress: 0,
          status: 'error',
          error,
        };
      } else {
        validFiles.push(file);
        newProgress[file.name] = {
          fileName: file.name,
          progress: 0,
          status: 'pending',
        };
      }
    });

    setFiles((prev) => [...prev, ...validFiles]);
    setUploadProgress((prev) => ({ ...prev, ...newProgress }));
  };

  const removeFile = (fileName: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== fileName));
    setUploadProgress((prev) => {
      const { [fileName]: _, ...rest } = prev;
      return rest;
    });
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    setIsUploading(true);
    const uploadedCreatives: CreativeMetadata[] = [];

    for (const file of files) {
      setUploadProgress((prev) => ({
        ...prev,
        [file.name]: { ...prev[file.name], status: 'uploading' },
      }));

      try {
        const creative = await uploadCreative(file, (progress) => {
          setUploadProgress((prev) => ({
            ...prev,
            [file.name]: { ...prev[file.name], progress },
          }));
        });

        uploadedCreatives.push(creative);
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: { ...prev[file.name], status: 'complete', progress: 100 },
        }));
      } catch (error) {
        console.error('Upload error:', error);
        setUploadProgress((prev) => ({
          ...prev,
          [file.name]: {
            ...prev[file.name],
            status: 'error',
            error: error instanceof Error ? error.message : 'Erro ao fazer upload',
          },
        }));
      }
    }

    setIsUploading(false);

    if (uploadedCreatives.length > 0) {
      onUploadComplete(uploadedCreatives);
      // Reset after a short delay to show completion
      setTimeout(() => {
        setFiles([]);
        setUploadProgress({});
        onOpenChange(false);
      }, 1000);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const getStatusIcon = (status: UploadProgress['status']) => {
    switch (status) {
      case 'complete':
        return <CheckCircle className="w-5 h-5 text-emerald-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-destructive" />;
      case 'uploading':
      case 'processing':
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      default:
        return <File className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const pendingFiles = files.filter(
    (f) => uploadProgress[f.name]?.status !== 'complete' && uploadProgress[f.name]?.status !== 'error'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Fazer Upload de Criativos</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative border-2 border-dashed rounded-xl p-8 text-center transition-colors",
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            )}
          >
            <input
              type="file"
              multiple
              accept={Object.entries(ACCEPTED_TYPES)
                .flatMap(([mime, exts]) => [mime, ...exts])
                .join(',')}
              onChange={handleFileSelect}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              disabled={isUploading}
            />
            
            <div className="flex flex-col items-center gap-3">
              <div className="p-4 rounded-full bg-primary/10">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <div>
                <p className="text-lg font-medium text-foreground">
                  Arraste seus arquivos aqui
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  ou clique para selecionar
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                Suporta: JPG, PNG, WEBP, GIF, MP4, MOV, WEBM (máx. 100MB)
              </p>
            </div>
          </div>

          {/* File List */}
          <AnimatePresence>
            {Object.keys(uploadProgress).length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-3 max-h-64 overflow-y-auto"
              >
                {Object.values(uploadProgress).map((item) => (
                  <motion.div
                    key={item.fileName}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
                  >
                    {getStatusIcon(item.status)}
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {item.fileName}
                      </p>
                      {item.status === 'error' ? (
                        <p className="text-xs text-destructive">{item.error}</p>
                      ) : item.status === 'uploading' || item.status === 'processing' ? (
                        <Progress value={item.progress} className="h-1.5 mt-1" />
                      ) : item.status === 'complete' ? (
                        <p className="text-xs text-emerald-500">Upload completo</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {formatSize(files.find((f) => f.name === item.fileName)?.size || 0)}
                        </p>
                      )}
                    </div>

                    {!isUploading && item.status !== 'complete' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => removeFile(item.fileName)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isUploading}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleUpload}
              disabled={pendingFiles.length === 0 || isUploading}
              className="glow-primary"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Enviar {pendingFiles.length} arquivo{pendingFiles.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
