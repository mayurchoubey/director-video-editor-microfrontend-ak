import { IDesign } from "@designcombo/types";
import { create } from "zustand";
import { callPrimaryAppAPI } from "@/services/api";
import { api } from "@/config/environment";

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
        if (originalItem.trim) {
          target.trim = {
            from: originalItem.trim.from ?? 0,
            to: originalItem.trim.to ?? 0,
          };
        }

        if (originalItem.playbackRate !== undefined) {
          target.playbackRate = originalItem.playbackRate;
        }
      }

      clonedItems[itemId] = target;
    }

    (cloned as any).trackItemsMap = clonedItems;
    
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
const updateVideoVolume = (customPayload) => {

  let customTrackMap = customPayload.trackItemsMap;
  Object.keys(customTrackMap).forEach(key => {
    if(customTrackMap?.[key]?.["type"] === "video") {
      customTrackMap[key]["details"]["volume"] = (customTrackMap[key]["details"]["volume"]) >= 1 ? 1:customTrackMap[key]["details"]["volume"];
    }
  });
  return customPayload;    
}

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
        const customPayload = updateVideoVolume({...payload});
        const serializedPayload = serializeDesign(customPayload);
 
        // Step 1: POST request to start rendering using authenticated primary app API
        const randId = Math.floor(Math.random() * 9999) + 1;
        const outputFileName = `demo-vid-${randId}.mp4`;
        const payloadData = {videoData: {
          design: serializedPayload,
          options: {
            fps: 30,
            size: serializedPayload.size,
            format: "mp4",
          },
        }, outputFileName};
        //setTimeout(()=>{

        
        console.log("outputFileName="+outputFileName, payloadData);
        const jobInfo = await callPrimaryAppAPI(api.render, payloadData, 'POST');
      //   const jobInfo = {
      //     "statusCode": 201,
      //     "status": "error",
      //     "message": "Video is not created",          
      //     "data": {
      //         "fileURL": "https://remotionlambda-useast1-3rne5v73bs.s3.us-east-1.amazonaws.com/demo-vid-7304.mp4",
      //         "outputKey": "demo-vid-7304.mp4",
      //         "renderId": "9cq37ncm5w",
      //         "created_at": "2025-09-08",
      //         "bucketName": "remotionlambda-useast1-3rne5v73bs"
      //     }
      // };

        if(jobInfo?.status ==="success"){
          set({ 
            exporting: false, 
            displayProgressModal: true,
            output: { 
              url: jobInfo?.data?.fileURL, 
              type: get().exportType,
              jobId: jobInfo?.data?.renderId || 'unknown',
              renderInfo: {
                status : jobInfo?.status, message:jobInfo?.message, render_id:jobInfo?.data?.renderId
                ,created_at:jobInfo?.data?.created_at, 
                bucket_name: jobInfo?.data?.bucketName
              }
            }
          });
        } else {
          set({ exporting: false, 
            displayProgressModal: true,
            output: { 
              url: "", 
              type: get().exportType,
              jobId: jobInfo?.data?.renderId || 'unknown',
              renderInfo: { status: "error", message: jobInfo?.message,
                render_id:"",
                created_at:"", 
                bucket_name: ""
              }
            } 
          });
        }
        //},4000);
        // Job successfully queued - show completion modal directly
        
      } catch (error) {
        console.error(error);
        set({ exporting: false, 
          displayProgressModal: true,
          output: { 
          url: "", 
          type: "",
          jobId: 'unknown',
          renderInfo: { status: "error", message: "Error: Video is not rendered, please try again later",
            render_id:"",
            created_at:"", 
            bucket_name: ""}
          } 
        });

      }
    },
  },
}));
