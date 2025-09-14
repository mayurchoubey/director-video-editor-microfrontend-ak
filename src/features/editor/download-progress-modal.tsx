import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDownloadState } from "./store/use-download-state";
import { Button } from "@/components/ui/button";
import { CircleCheckIcon, CircleX } from "lucide-react";
import { DialogDescription, DialogTitle } from "@radix-ui/react-dialog";
import { download } from "@/utils/download";
import { getPrimaryAppUiUrl, config } from "@/config/environment";

const DownloadProgressModal = () => {
  const { progress, displayProgressModal, output, actions, exporting } =
    useDownloadState();
  
  // Check if we have a job queued (output with jobId but no url)
  const isJobQueued = output?.jobId && !output?.url;
  const isCompleted = progress === 100 && output?.url;
  const status = output?.renderInfo?.status;

  const handleDownload = async () => {
    if (output?.url) {
      window.open(output.url, '_blank');
      //await download(output.url, "untitled.mp4");
      console.log("downloading");
    }
  };

  const handleVisitRendersPage = () => {
    // Close the modal and redirect to renders page
    actions.setDisplayProgressModal(false);
    
    // Debug: Log the configuration values
    console.log('Config values:', {
      uiBaseUrl: config.primaryApp.uiBaseUrl,
      rendersPagePath: config.primaryApp.rendersPagePath,
      fullUrl: getPrimaryAppUiUrl(config.primaryApp.rendersPagePath)
    });
    
    // Redirect using configuration with fallback
    const rendersUrl = getPrimaryAppUiUrl(config.primaryApp.rendersPagePath) || 'http://localhost:3003/renders';
    window.open(rendersUrl, '_blank');
  };
  return (
    <Dialog
      open={displayProgressModal}
      onOpenChange={actions.setDisplayProgressModal}
    >
      <DialogContent className="flex h-[627px] flex-col gap-0 bg-background p-0 sm:max-w-[844px]">
        <DialogTitle className="hidden" />
        <DialogDescription className="hidden" />

        <div className="flex h-16 items-center border-b px-4 font-medium text-orange-600">
          {isJobQueued ? 'Render Job Queued' : 'Download'}
        </div>
        
                {isJobQueued ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="font-semibold text-orange-500">
                {status==="success"?<CircleCheckIcon className="h-20 w-20" />:<CircleX className="h-20 w-20" />}
              </div>
              <div className="font-bold text-2xl text-orange-600">{status==="success"?"Render Job Queued!":"Error"}</div>
              <div className="text-muted-foreground max-w-sm text-center text-lg">
                {output.renderInfo?.message || 'Your video render job has been successfully queued.'}
              </div>
              {status==="success" && <div className="text-sm text-muted-foreground">
                Visit the renders page to track progress and download when ready.
              </div>}
            </div>
            {status==="success" && <div className="flex gap-3">
              <Button 
                onClick={handleVisitRendersPage} 
                className="bg-orange-500 hover:bg-orange-600 text-white border-0 px-8 py-3 text-lg font-semibold"
                style={{
                  backgroundColor: 'rgba(249, 115, 22, 0.9)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgb(249, 115, 22)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(249, 115, 22, 0.9)';
                }}
              >
                Visit Renders Page
              </Button>
            </div>}
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 space-y-4">
            <div className="flex flex-col items-center space-y-1 text-center">
              <div className="font-semibold">
                <CircleCheckIcon />
              </div>
              <div className="font-bold">Exported</div>
              <div className="text-muted-foreground">
                You can download the video to your device.
              </div>
            </div>
            <Button onClick={handleDownload}>Download</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DownloadProgressModal;
