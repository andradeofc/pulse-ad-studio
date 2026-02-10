import { supabase } from '@/integrations/supabase/client';

export interface CreativeMetadata {
  id: string;
  user_id: string;
  name: string;
  type: 'video' | 'image';
  file_path: string;
  url: string;
  thumbnail_url: string | null;
  width: number | null;
  height: number | null;
  size: number;
  duration: number | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'error';
  error?: string;
}

/**
 * Get file dimensions (for images and videos)
 */
async function getMediaDimensions(file: File): Promise<{ width: number; height: number; duration?: number }> {
  return new Promise((resolve, reject) => {
    if (file.type.startsWith('image/')) {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
        URL.revokeObjectURL(img.src);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = URL.createObjectURL(file);
    } else if (file.type.startsWith('video/')) {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        });
        URL.revokeObjectURL(video.src);
      };
      video.onerror = () => reject(new Error('Failed to load video'));
      video.src = URL.createObjectURL(file);
    } else {
      reject(new Error('Unsupported file type'));
    }
  });
}

/**
 * Generate thumbnail for video
 */
async function generateVideoThumbnail(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    video.onloadeddata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(video.src);
            resolve(blob);
          },
          'image/jpeg',
          0.8
        );
      } else {
        URL.revokeObjectURL(video.src);
        resolve(null);
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };

    video.src = URL.createObjectURL(file);
  });
}

/**
 * Upload a creative file to storage
 */
export async function uploadCreative(
  file: File,
  onProgress?: (progress: number) => void
): Promise<CreativeMetadata> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Usuário não autenticado');

  const fileType = file.type.startsWith('video/') ? 'video' : 'image';
  const fileExt = file.name.split('.').pop();
  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${user.id}/${fileName}`;

  // Get media dimensions
  const dimensions = await getMediaDimensions(file);

  // Upload main file
  onProgress?.(10);
  
  const { error: uploadError } = await supabase.storage
    .from('creatives')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) throw uploadError;

  onProgress?.(60);

  // Get public URL
  const { data: urlData } = supabase.storage
    .from('creatives')
    .getPublicUrl(filePath);

  let thumbnailUrl: string | null = null;

  // Generate and upload thumbnail for videos
  if (fileType === 'video') {
    onProgress?.(70);
    const thumbnail = await generateVideoThumbnail(file);
    if (thumbnail) {
      const thumbPath = `${user.id}/thumbs/${fileName.replace(/\.[^.]+$/, '.jpg')}`;
      const { error: thumbError } = await supabase.storage
        .from('creatives')
        .upload(thumbPath, thumbnail, {
          cacheControl: '3600',
          upsert: false,
        });

      if (!thumbError) {
        const { data: thumbUrlData } = supabase.storage
          .from('creatives')
          .getPublicUrl(thumbPath);
        thumbnailUrl = thumbUrlData.publicUrl;
      }
    }
  } else {
    // For images, use the same URL as thumbnail
    thumbnailUrl = urlData.publicUrl;
  }

  onProgress?.(85);

  // Save metadata to database
  const { data: creative, error: dbError } = await supabase
    .from('creatives')
    .insert({
      user_id: user.id,
      name: file.name,
      type: fileType,
      file_path: filePath,
      url: urlData.publicUrl,
      thumbnail_url: thumbnailUrl,
      width: dimensions.width,
      height: dimensions.height,
      size: file.size,
      duration: dimensions.duration ?? null,
    })
    .select()
    .single();

  if (dbError) throw dbError;

  onProgress?.(100);

  return creative as CreativeMetadata;
}

/**
 * Fetch all creatives for the current user
 */
export async function fetchCreatives(): Promise<CreativeMetadata[]> {
  const { data, error } = await supabase
    .from('creatives')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as CreativeMetadata[];
}

/**
 * Update a creative's name
 */
export async function renameCreative(id: string, newName: string): Promise<CreativeMetadata> {
  const { data, error } = await supabase
    .from('creatives')
    .update({ name: newName })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as CreativeMetadata;
}

/**
 * Delete a creative
 */
export async function deleteCreative(id: string, filePath: string): Promise<void> {
  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('creatives')
    .remove([filePath]);

  if (storageError) console.error('Error deleting file:', storageError);

  // Delete thumbnail if exists
  const thumbPath = filePath.replace(/\/([^/]+)$/, '/thumbs/$1').replace(/\.[^.]+$/, '.jpg');
  await supabase.storage.from('creatives').remove([thumbPath]).catch(() => {});

  // Delete metadata
  const { error: dbError } = await supabase
    .from('creatives')
    .delete()
    .eq('id', id);

  if (dbError) throw dbError;
}
