import { IDesign } from "@designcombo/types";
import { create } from "zustand";
import { callPrimaryAppAPI } from "@/services/api";
import { api } from "@/config/environment";

// Convert HTML rich text to plain text with newline characters.
// This preserves intended line breaks while removing tags/entities.
function htmlToPlainTextWithNewlines(html?: string): string {
  if (!html) return "";
  try {
    const container = document.createElement("div");
    // First, convert explicit line-break tags to \n so they survive textContent extraction
    const normalized = html
      .replace(/<br\s*\/?>(?=\s*<\/div>|\s*$)/gi, "\n") // <br> at EOL
      .replace(/<br\s*\/?>(?!\n)/gi, "\n") // any <br>
      .replace(/<\/p>/gi, "\n")
      .replace(/<p[^>]*>/gi, "")
      .replace(/<\/div><div[^>]*>/gi, "\n")
      .replace(/<div[^>]*>/gi, "\n")
      .replace(/<\/div>/gi, "\n");;

    container.innerHTML = normalized;
    let text = (container.textContent || container.innerText || "");
    text = text.replace(/\u00A0/g, " "); // decode &nbsp;
    // Normalize CRLF to LF; preserve all consecutive newlines as-is
    text = text.replace(/\r\n/g, "\n");
    // Do not trim; preserve leading/trailing newlines and spaces exactly
    return text;
  } catch {
    return html;
  }
}

// Helper function to convert proxied URLs back to original URLs for rendering
function deproxyUrl(url: string): string {
  if (!url || typeof url !== 'string') return url;
  
  // Check if it's a proxied URL
  if (url.includes('/proxy?url=')) {
    try {
      const decodedUrl = decodeURIComponent(url.split('proxy?url=')[1]);
      console.log('🔄 Deproxying URL:', url, '->', decodedUrl);
      return decodedUrl;
    } catch (e) {
      console.warn('Failed to deproxy URL:', url, e);
      return url;
    }
  }
  
  return url;
}

// Ensure track items are serialized as plain JSON and include critical fields
function serializeDesign(design: IDesign): IDesign {
  try {
    console.log('🔍 Original design trackItemsMap:', design);
    
    const cloned = JSON.parse(JSON.stringify(design)) as IDesign;

    // Safeguard if maps are missing after stringify (shouldn't, but defensive)
    const originalItems = (design as any).trackItemsMap || {};
    const clonedItems = (cloned as any).trackItemsMap || {};

    console.log('🔍 Original trackItemsMap keys:', Object.keys(originalItems));
    
    for (const [itemId, originalItem] of Object.entries<any>(originalItems)) {
      console.log(`🔍 Item ${itemId}:`, {
        type: originalItem?.type,
        hasTrim: !!originalItem?.trim,
        trim: originalItem?.trim,
        hasPlaybackRate: originalItem?.playbackRate !== undefined,
        playbackRate: originalItem?.playbackRate,
        keys: Object.keys(originalItem || {}),
        enumerableKeys: Object.getOwnPropertyNames(originalItem || {}),
        descriptors: Object.getOwnPropertyDescriptor(originalItem, 'trim'),
      });
      
      const target = clonedItems[itemId] || {};

      // Explicitly copy non-enumerable/derived fields
      if (originalItem && typeof originalItem === "object") {
        // Normalize text content: convert HTML to plain text with \n for Remotion backend
        if (originalItem.type === "text") {
          const details = (target as any).details || {};
          if (typeof details.text === "string") {
            details.text = htmlToPlainTextWithNewlines(details.text);
            (target as any).details = details;
          }
        }
        if (originalItem.trim) {
          target.trim = {
            from: originalItem.trim.from ?? 0,
            to: originalItem.trim.to ?? 0,
          };
        }

        if (originalItem.playbackRate !== undefined) {
          target.playbackRate = originalItem.playbackRate;
        }

        // Normalize media volumes to 0–1 internally, but send as 0–100 to Remotion renderer
        if ((originalItem.type === "audio" || originalItem.type === "video") && originalItem.details) {
          const originalDetails = originalItem.details || {};
          const targetDetails = (target as any).details || {};

          let vol = originalDetails.volume;
          if (vol === undefined || vol === null) {
            vol = 1; // default 1
          }
          // If someone stored 100-scale by mistake, convert to 0–1.
          if (typeof vol === "number" && vol > 1) {
            vol = vol / 100;
          }
          // Clamp to [0,1]
          if (typeof vol === "number") {
            vol = Math.max(0, Math.min(1, vol));
          }

          // Deproxy the source URL for rendering
          let src = targetDetails.src || originalDetails.src;
          if (src && typeof src === 'string') {
            src = deproxyUrl(src);
          }

          (target as any).details = {
            ...targetDetails,
            // Convert volume from 0-1 to 0-100 for Remotion renderer (which divides by 100)
            volume: vol * 100,
            src: src,
          };
        }

        // Handle image URLs - also need to deproxy for rendering
        if (originalItem.type === "image" && originalItem.details) {
          const originalDetails = originalItem.details || {};
          const targetDetails = (target as any).details || {};
          
          let src = targetDetails.src || originalDetails.src;
          if (src && typeof src === 'string') {
            src = deproxyUrl(src);
          }

          (target as any).details = {
            ...targetDetails,
            src: src,
          };
        }
      }

      clonedItems[itemId] = target;
    }

    (cloned as any).trackItemsMap = clonedItems;

    // Ensure text items carry plain text with \n and an explicit whiteSpace hint
    // Also ensure all media URLs are deproxied for rendering
    for (const [, item] of Object.entries<any>(clonedItems)) {
      if (item?.type === "text" && item?.details) {
        if (typeof item.details.text === "string") {
          item.details.text = htmlToPlainTextWithNewlines(item.details.text);
        }
        if (!item.details.whiteSpace) {
          item.details.whiteSpace = "pre-wrap"; // hint for renderer
        }
      }
      
      // Final pass: ensure all media URLs are deproxied for rendering
      if ((item?.type === "video" || item?.type === "audio" || item?.type === "image") && item?.details?.src) {
        if (typeof item.details.src === 'string') {
          item.details.src = deproxyUrl(item.details.src);
        }
      }
    }
    
    console.log('🔍 Serialized payload trackItemsMap:', cloned);
    return cloned;
  } catch (e) {
    console.error('❌ Serialization error:', e);
    // Fallback: if anything goes wrong, return original design
    return design;
  }
}

interface Output {
  url: string;
  type: string;
  jobId?: string;
  renderInfo?: {
    render_id: string;
    bucket_name: string;
    status: string;
    message: string;
    created_at: string;
  };
}

interface DownloadState {
  projectId: string;
  exporting: boolean;
  exportType: "json" | "mp4";
  progress: number;
  output?: Output;
  payload?: IDesign;
  displayProgressModal: boolean;
  actions: {
    setProjectId: (projectId: string) => void;
    setExporting: (exporting: boolean) => void;
    setExportType: (exportType: "json" | "mp4") => void;
    setProgress: (progress: number) => void;
    setState: (state: Partial<DownloadState>) => void;
    setOutput: (output: Output) => void;
    startExport: () => void;
    setDisplayProgressModal: (displayProgressModal: boolean) => void;
  };
}
// Note: baseUrl is no longer used since we're using the authenticated API service

export const useDownloadState = create<DownloadState>((set, get) => ({
  projectId: "",
  exporting: false,
  exportType: "mp4",
  progress: 0,
  displayProgressModal: false,
  actions: {
    setProjectId: (projectId) => set({ projectId }),
    setExporting: (exporting) => set({ exporting }),
    setExportType: (exportType) => set({ exportType }),
    setProgress: (progress) => set({ progress }),
    setState: (state) => set({ ...state }),
    setOutput: (output) => set({ output }),
    setDisplayProgressModal: (displayProgressModal) =>
      set({ displayProgressModal }),
    startExport: async () => {
      try {
        // Set exporting to true immediately when starting
        set({ exporting: true });
        
        // Assume payload to be stored in the state for POST request
        const { payload } = get();

        if (!payload) throw new Error("Payload is not defined");

        // Normalize payload to plain JSON and ensure critical fields exist
        const serializedPayload = serializeDesign(payload);

        // Step 1: POST request to start rendering using authenticated primary app API
        const jobInfo = await callPrimaryAppAPI(api.render, {
          design: serializedPayload,
          options: {
            fps: 30,
            size: serializedPayload.size,
            format: "mp4",
          },
        }, 'POST');

        // Job successfully queued - show completion modal directly
        set({ 
          exporting: false, 
          displayProgressModal: true,
          output: { 
            url: '', 
            type: get().exportType,
            jobId: jobInfo.render_id || 'unknown',
            renderInfo: jobInfo
          }
        });
      } catch (error) {
        console.error(error);
        set({ exporting: false });
      }
    },
  },
}));
