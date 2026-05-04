import { Link } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Trash2, Image as ImageIcon, Sparkles, Plus, Minus, Loader2, Save, X, Waves, Mountain, GalleryHorizontal, ChevronDown, ChevronUp, Check, Inbox, AlertTriangle, Eye, Play, ShieldBan, ShieldOff, Settings, Bell, Camera, Scissors, Search, Grid3X3, List, Copy, ZoomIn, Tag, BookOpen, FileText, MapPin, Monitor, Upload, Maximize2, GripVertical, FolderUp } from "lucide-react";
import { AIImageEnhancerModal, type SliderData } from "@/components/AIImageEnhancerModal";
import { BulkUploadDialog } from "@/components/BulkUploadDialog";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useImageLibrary, SCREENSHOT_CATEGORIES } from "@/hooks/useImageLibrary";
import type { ImagePair, ScreenshotEntry } from "@/hooks/useImageLibrary";


export function AdminImages() {
  const [isBulkUploadDialogOpen, setIsBulkUploadDialogOpen] = useState(false);
  const lib = useImageLibrary();
  const {
    settings, loading, token, images, setImages, savedImages, isEnhancerOpen, setIsEnhancerOpen,
    newImageUrl, setNewImageUrl, processingUrl, saveMessage, setSaveMessage,
    hasUnsavedChanges, markDirty, markClean, blocker, justSaved,
    expandedSections, toggleSection, localizing, siteName, setSiteName,
    urlSiteName, setUrlSiteName, urlPhotographerCredit, setUrlPhotographerCredit, urlWatermarkSize, setUrlWatermarkSize, urlWatermarkPosition, setUrlWatermarkPosition, generatingSliders,
    screenshots, savedScreenshots, uploadBranch, setUploadBranch,
    heroPreloadedImage, setHeroPreloadedImage, heroFileInputRef,
    ssName, setSsName, ssCategory, setSsCategory, ssPhotographerCredit, setSsPhotographerCredit, ssWatermarkSize, setSsWatermarkSize, ssWatermarkPosition, setSsWatermarkPosition,
    showSsCrop, setShowSsCrop,
    ssCropTop, setSsCropTop, ssCropBottom, setSsCropBottom,
    ssCropLeft, setSsCropLeft, ssCropRight, setSsCropRight,
    ssZoom, setSsZoom, ssPanX, setSsPanX, ssPanY, setSsPanY,
    ssDragging, setSsDragging, ssDragStart, setSsDragStart,
    ssProcessing, pendingSsImage, setPendingSsImage,
    showExistingPicker, setShowExistingPicker, loadingExisting,
    ssViewMode, setSsViewMode, ssFilterCategory, setSsFilterCategory,
    ssSearch, setSsSearch, copiedTag, ssFileInputRef,
    submissions, loadingSubmissions, submissionPreview, setSubmissionPreview,
    submissionImageUrls, processingSubmission, submissionForEnhancer, setSubmissionForEnhancer,
    bannedIps, showBannedIps, setShowBannedIps,
    newBanIp, setNewBanIp, newBanReason, setNewBanReason,
    submissionNotifyEnabled, setSubmissionNotifyEnabled,
    submissionNotifyHour, setSubmissionNotifyHour,
    submissionRateLimit, setSubmissionRateLimit,
    settingsLoaded, submissionFilter, setSubmissionFilter,
    lightboxSrc, setLightboxSrc,
    updateSettings, markChanged,
    handlePickExisting, handleSsFileSelect, handleHeroFileSelect,
    handleSaveScreenshot, handleDeleteScreenshot, handleCopyTag,
    filteredScreenshots, handleSave, handleEnhancedAccept, handlePickExistingHero, showHeroPicker, setShowHeroPicker,
    handleAddUrl, handleRemoveWide, handleRemoveBanner, handleSetCategory,
    wideImages, bannerImages, sliderImages,
    handleToggleSlider, handleDeleteSliderImage, handleGenerateAllSliders,
    fetchSubmissions, saveSubmissionSettings,
    handleDeleteSubmission, handleProcessSubmission,
    handleAddBannedIp, handleRemoveBannedIp, handleBanSubmissionIp,
    handleSubmissionEnhancerAccept,
    handleBulkUploadAccept,
    initialHeroImage, setInitialHeroImage,
  } = lib;


  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <Link to="/admin" className="text-sky hover:text-sky-light text-sm flex items-center mb-6">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-navy flex items-center">
            <ImageIcon className="w-8 h-8 mr-3" /> Image Processing
          </h1>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasUnsavedChanges && !justSaved}
            className={`h-10 px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : hasUnsavedChanges ? "bg-navy hover:bg-navy-light" : "bg-muted cursor-not-allowed"} text-white`}
          >
            {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
          </Button>
        </div>

        {localizing && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-sky-50 text-sky-700 border border-sky-200 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Downloading remote images and saving local copies...
          </div>
        )}

        {saveMessage && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${saveMessage.type === "success" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
            {saveMessage.text}
          </div>
        )}

        {hasUnsavedChanges && (
          <div className="mb-4 p-3 rounded-lg text-sm bg-amber-50 text-amber-700 border border-amber-200">
            You have unsaved changes. Click "Save Changes" to keep them.
          </div>
        )}

        <Card className="mb-6 overflow-hidden">
          <button type="button" onClick={() => toggleSection("add")} className="w-full text-left">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Add Images</CardTitle>
                  <CardDescription className="mt-1">Load an image from a URL, file, or community submission. Choose the processing workflow.</CardDescription>
                </div>
                {expandedSections.has("add") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
              </div>
            </CardHeader>
          </button>
          {expandedSections.has("add") && <CardContent>
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <input
                  type="text"
                  value={newImageUrl}
                  onChange={(e) => setNewImageUrl(e.target.value)}
                  placeholder="Paste image URL (Dropbox, Google Drive, direct link...)"
                  className="flex-grow min-w-[200px] p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky"
                />
                <Button type="button" onClick={handleAddUrl} disabled={!newImageUrl.trim() || !urlSiteName.trim() || processingUrl} className="bg-sky hover:bg-sky-light text-white">
                  {processingUrl ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processing...</> : <><Plus className="w-4 h-4 mr-2" /> Add URL</>}
                </Button>
                <Button type="button" onClick={() => setIsEnhancerOpen(true)} className="bg-navy hover:bg-navy-light text-white">
                  <Sparkles className="w-4 h-4 mr-2" /> Upload / Enhance
                </Button>
              </div>
              {newImageUrl.trim() && (
                <div className="space-y-2">
                  <div className="flex gap-2 items-center">
                    <label className="text-xs font-medium text-foreground-secondary whitespace-nowrap">Site Name <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={urlSiteName}
                      onChange={(e) => setUrlSiteName(e.target.value)}
                      placeholder="e.g. Mystic Launch, Ben Nevis"
                      className="flex-grow p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                    />
                  </div>
                  <div className="flex gap-2 items-center">
                    <label className="text-xs font-medium text-foreground-secondary whitespace-nowrap">Photographer</label>
                    <input
                      type="text"
                      value={urlPhotographerCredit}
                      onChange={(e) => setUrlPhotographerCredit(e.target.value)}
                      placeholder="e.g. Jane Smith Photography (optional)"
                      maxLength={60}
                      className="flex-grow p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                    />
                  </div>
                  {urlPhotographerCredit.trim() && (
                    <div className="flex gap-2 items-center flex-wrap">
                      <label className="text-xs font-medium text-foreground-secondary whitespace-nowrap">Size: {urlWatermarkSize}%</label>
                      <input type="range" min={5} max={50} value={urlWatermarkSize} onChange={(e) => setUrlWatermarkSize(parseInt(e.target.value, 10))} className="flex-grow h-1.5 accent-sky-500 min-w-[80px]" />
                      <div className="flex gap-0.5">
                        {(["bottom-left","bottom-center","bottom-right","top-left","top-center","top-right"] as const).map(p => (
                          <button key={p} type="button" onClick={() => setUrlWatermarkPosition(p)} className={`text-[9px] px-1 py-0.5 rounded border ${urlWatermarkPosition === p ? "bg-sky text-white border-sky" : "border-border text-foreground-faint hover:border-sky/50"}`}>
                            {p === "bottom-right" ? "BR" : p === "bottom-left" ? "BL" : p === "bottom-center" ? "BC" : p === "top-right" ? "TR" : p === "top-left" ? "TL" : "TC"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input type="file" ref={ssFileInputRef} accept="image/*" className="hidden" onChange={handleSsFileSelect} />

              {uploadBranch === "" && !pendingSsImage && (
                <>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="h-px flex-1 bg-border" />
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Load from</span>
                    <div className="h-px flex-1 bg-border" />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    <button
                      type="button"
                      onClick={() => setUploadBranch("hero")}
                      className="border-2 border-dashed border-sky/30 rounded-lg p-4 hover:border-sky hover:bg-sky/5 transition-all group text-left"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-sky/10 rounded-lg flex items-center justify-center group-hover:bg-sky/20 transition-colors">
                          <Sparkles className="w-4 h-4 text-sky" />
                        </div>
                        <span className="font-semibold text-sm text-foreground">Hero &amp; Banner</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        AI enhancer → hero (1920×1080), banner (1920×600), and slider variants. For site headers and home page backgrounds.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setUploadBranch("screenshot"); }}
                      className="border-2 border-dashed border-amber-300/50 rounded-lg p-4 hover:border-amber-400 hover:bg-amber-50/50 transition-all group text-left"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center group-hover:bg-amber-200 transition-colors">
                          <Camera className="w-4 h-4 text-amber-600" />
                        </div>
                        <span className="font-semibold text-sm text-foreground">Manual / Guide Image</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Optional crop → stored at original size. For procedure manuals, admin guides, site guides. Gets an insertable tag.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadBranch("community")}
                      className="border-2 border-dashed border-emerald-300/50 rounded-lg p-4 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group text-left"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center group-hover:bg-emerald-200 transition-colors">
                          <Inbox className="w-4 h-4 text-emerald-600" />
                        </div>
                        <span className="font-semibold text-sm text-foreground">Community Submissions</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        {submissions.length > 0
                          ? `${submissions.length} pending — review and process member-submitted photos for hero images or guides.`
                          : "No pending submissions. Member-submitted photos appear here for review."}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsBulkUploadDialogOpen(true)}
                      className="border-2 border-dashed border-purple-300/50 rounded-lg p-4 hover:border-purple-400 hover:bg-purple-50/50 transition-all group text-left"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                          <FolderUp className="w-4 h-4 text-purple-600" />
                        </div>
                        <span className="font-semibold text-sm text-foreground">Bulk Upload</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Upload multiple images at once, all processed as hero size with single photographer credit.
                      </p>
                    </button>
                  </div>
                </>
              )}

              {uploadBranch === "screenshot" && pendingSsImage && !showSsCrop && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">Manual / Guide Image</span>
                    </div>
                    <button type="button" onClick={() => { setUploadBranch(""); setPendingSsImage(null); setSsName(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <img
                      src={`data:${pendingSsImage.mimeType};base64,${pendingSsImage.base64}`}
                      alt="Preview"
                      className="w-32 h-24 object-cover rounded border"
                    />
                    <div className="flex-1 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-foreground-secondary block mb-0.5">Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={ssName}
                          onChange={e => setSsName(e.target.value)}
                          placeholder="e.g. Admin Dashboard Overview"
                          className="w-full p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground-secondary block mb-0.5">Category</label>
                        <select
                          value={ssCategory}
                          onChange={e => setSsCategory(e.target.value)}
                          className="w-full p-1.5 border border-border rounded-md text-sm bg-background focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        >
                          {SCREENSHOT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-foreground-secondary block mb-0.5">Photographer Credit <span className="text-foreground-faint font-normal">(optional)</span></label>
                        <input
                          type="text"
                          value={ssPhotographerCredit}
                          onChange={e => setSsPhotographerCredit(e.target.value)}
                          placeholder="e.g. Jane Smith Photography"
                          maxLength={60}
                          className="w-full p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                        {ssPhotographerCredit.trim() && (
                          <div className="mt-1.5 space-y-1">
                            <div className="flex items-center gap-1.5">
                              <label className="text-xs font-medium text-foreground-secondary whitespace-nowrap">Size: {ssWatermarkSize}%</label>
                              <input type="range" min={5} max={50} value={ssWatermarkSize} onChange={(e) => setSsWatermarkSize(parseInt(e.target.value, 10))} className="flex-grow h-1.5 accent-amber-500" />
                            </div>
                            <div className="flex items-center gap-1">
                              <label className="text-[10px] text-foreground-secondary mr-1">Pos:</label>
                              {(["BL","BC","BR","TL","TC","TR"] as const).map((lbl, i) => {
                                const pos = (["bottom-left","bottom-center","bottom-right","top-left","top-center","top-right"] as const)[i];
                                return <button key={pos} type="button" onClick={() => setSsWatermarkPosition(pos)} className={`text-[9px] px-1 py-0.5 rounded border ${ssWatermarkPosition === pos ? "bg-amber-600 text-white border-amber-600" : "border-border text-foreground-faint hover:border-amber-400"}`}>{lbl}</button>;
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-amber-700">
                    Image will be saved at original size ({pendingSsImage.naturalWidth}×{pendingSsImage.naturalHeight}). A <code className="bg-amber-100 px-1 rounded text-[10px]">{"{{screenshot:ID}}"}</code> tag is auto-assigned for embedding in markdown.
                  </p>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" className="text-xs" onClick={() => setShowSsCrop(true)}>
                      <Scissors className="w-3 h-3 mr-1" /> Crop First
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs bg-amber-600 hover:bg-amber-700 text-white"
                      disabled={!ssName.trim() || ssProcessing}
                      onClick={() => handleSaveScreenshot(false)}
                    >
                      {ssProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : <><Check className="w-3 h-3 mr-1" /> Save As-Is</>}
                    </Button>
                  </div>
                </div>
              )}

              {uploadBranch === "screenshot" && pendingSsImage && showSsCrop && (() => {
                const cropW = Math.max(100 - ssCropLeft - ssCropRight, 5);
                const cropH = Math.max(100 - ssCropTop - ssCropBottom, 5);
                const croppedW = Math.round(pendingSsImage.naturalWidth * cropW / 100);
                const croppedH = Math.round(pendingSsImage.naturalHeight * cropH / 100);
                const origAr = pendingSsImage.naturalWidth / pendingSsImage.naturalHeight;
                const baseH = origAr >= 1 ? 600 : 800;
                const maxPreviewH = Math.min(2000, Math.max(baseH, Math.round(600 * 100 / cropH)));
                const pxStepX = pendingSsImage.naturalWidth > 0 ? Math.max(0.01, 100 / pendingSsImage.naturalWidth) : 1;
                const pxStepY = pendingSsImage.naturalHeight > 0 ? Math.max(0.01, 100 / pendingSsImage.naturalHeight) : 1;
                return (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <Scissors className="w-4 h-4 text-amber-600" />
                      Crop Image
                    </h4>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" size="sm" className="text-xs h-7 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300" onClick={() => { setPendingSsImage(null); setShowSsCrop(false); setSsCropTop(0); setSsCropBottom(0); setSsCropLeft(0); setSsCropRight(0); setSsZoom(1); setSsPanX(0); setSsPanY(0); }}>
                        <X className="w-3 h-3 mr-1" /> Abort
                      </Button>
                      <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={() => setShowSsCrop(false)}>
                        Skip — Use Full Image
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="text-xs h-7 bg-amber-600 hover:bg-amber-700 text-white"
                        disabled={!ssName.trim() || ssProcessing}
                        onClick={() => handleSaveScreenshot(true)}
                      >
                        {ssProcessing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving...</> : <><Check className="w-3 h-3 mr-1" /> Save Crop</>}
                      </Button>
                    </div>
                  </div>
                  <div className="flex gap-3 items-end flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">Name</label>
                      <input type="text" value={ssName} onChange={e => setSsName(e.target.value)} placeholder="Image name" className="w-full p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">Category</label>
                      <select value={ssCategory} onChange={e => setSsCategory(e.target.value)} className="p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400">
                        {SCREENSHOT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-xs font-medium text-foreground-secondary mb-1 block">Photographer <span className="text-foreground-faint font-normal">(optional)</span></label>
                      <input type="text" value={ssPhotographerCredit} onChange={e => setSsPhotographerCredit(e.target.value)} placeholder="e.g. Jane Smith" maxLength={60} className="w-full p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400" />
                      {ssPhotographerCredit.trim() && (
                        <div className="mt-1 space-y-0.5">
                          <div className="flex items-center gap-1">
                            <label className="text-[10px] text-foreground-secondary">Size: {ssWatermarkSize}%</label>
                            <input type="range" min={5} max={50} value={ssWatermarkSize} onChange={(e) => setSsWatermarkSize(parseInt(e.target.value, 10))} className="flex-grow h-1 accent-amber-500" />
                          </div>
                          <div className="flex items-center gap-0.5">
                            {(["BL","BC","BR","TL","TC","TR"] as const).map((lbl, i) => {
                              const pos = (["bottom-left","bottom-center","bottom-right","top-left","top-center","top-right"] as const)[i];
                              return <button key={pos} type="button" onClick={() => setSsWatermarkPosition(pos)} className={`text-[8px] px-0.5 py-0.5 rounded border leading-none ${ssWatermarkPosition === pos ? "bg-amber-600 text-white border-amber-600" : "border-border text-foreground-faint"}`}>{lbl}</button>;
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div
                    className="relative rounded-lg overflow-hidden border border-border bg-black select-none flex items-center justify-center"
                    style={{ maxHeight: maxPreviewH }}
                    onMouseDown={e => {
                      if (ssZoom <= 1) return;
                      setSsDragging(true);
                      setSsDragStart({ x: e.clientX - ssPanX, y: e.clientY - ssPanY });
                    }}
                    onMouseMove={e => {
                      if (!ssDragging) return;
                      setSsPanX(e.clientX - ssDragStart.x);
                      setSsPanY(e.clientY - ssDragStart.y);
                    }}
                    onMouseUp={() => setSsDragging(false)}
                    onMouseLeave={() => setSsDragging(false)}
                  >
                    <div
                      className="relative overflow-hidden"
                      style={{ aspectRatio: `${pendingSsImage.naturalWidth}/${pendingSsImage.naturalHeight}`, maxHeight: maxPreviewH, maxWidth: '100%', width: `${maxPreviewH * pendingSsImage.naturalWidth / pendingSsImage.naturalHeight}px` }}
                    >
                      <img
                        src={`data:${pendingSsImage.mimeType};base64,${pendingSsImage.base64}`}
                        alt="Screenshot to crop"
                        draggable={false}
                        className="w-full h-full"
                        style={{
                          objectFit: "contain",
                          transform: ssZoom > 1 ? `scale(${ssZoom}) translate(${ssPanX / ssZoom}px, ${ssPanY / ssZoom}px)` : undefined,
                          cursor: ssZoom > 1 ? (ssDragging ? "grabbing" : "grab") : "default",
                        }}
                      />
                      <div className="absolute inset-0 pointer-events-none">
                        <div className="absolute bg-black/50" style={{ left: 0, top: 0, right: 0, height: `${ssCropTop}%` }} />
                        <div className="absolute bg-black/50" style={{ left: 0, bottom: 0, right: 0, height: `${ssCropBottom}%` }} />
                        <div className="absolute bg-black/50" style={{ left: 0, top: `${ssCropTop}%`, width: `${ssCropLeft}%`, bottom: `${ssCropBottom}%` }} />
                        <div className="absolute bg-black/50" style={{ right: 0, top: `${ssCropTop}%`, width: `${ssCropRight}%`, bottom: `${ssCropBottom}%` }} />
                        <div
                          className="absolute border-2 border-dashed border-amber-400"
                          style={{ left: `${ssCropLeft}%`, top: `${ssCropTop}%`, right: `${ssCropRight}%`, bottom: `${ssCropBottom}%` }}
                        >
                          <div className="absolute -top-0.5 -left-0.5 w-2 h-2 bg-amber-400 rounded-sm" />
                          <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-sm" />
                          <div className="absolute -bottom-0.5 -left-0.5 w-2 h-2 bg-amber-400 rounded-sm" />
                          <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-sm" />
                        </div>
                      </div>
                      <div className="absolute bottom-2 right-2 flex flex-col gap-0 z-10">
                        <button
                          type="button"
                          onClick={() => setSsZoom(z => Math.min(z + 0.25, 5))}
                          className="w-7 h-7 bg-white/90 hover:bg-white rounded-t-md shadow flex items-center justify-center text-gray-700 hover:text-gray-900 border border-gray-200"
                          title="Zoom in"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => { setSsZoom(z => { const nz = Math.max(z - 0.25, 0.5); if (nz <= 1) { setSsPanX(0); setSsPanY(0); } return nz; }); }}
                          className="w-7 h-7 bg-white/90 hover:bg-white rounded-b-md shadow flex items-center justify-center text-gray-700 hover:text-gray-900 border border-gray-200 border-t-0"
                          title="Zoom out"
                        >
                          <Minus className="w-4 h-4" />
                        </button>
                      </div>
                      {ssZoom !== 1 && (
                        <div className="absolute top-2 left-2 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded">
                          {Math.round(ssZoom * 100)}%
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-foreground-secondary">Crop Top</label>
                        <span className="text-[10px] text-muted-foreground font-mono">{Math.round(ssCropTop / 100 * pendingSsImage.naturalHeight)}px ({ssCropTop.toFixed(1)}%)</span>
                      </div>
                      <input type="range" min={0} max={90} step={pxStepY} value={ssCropTop} onChange={e => setSsCropTop(Math.min(Number(e.target.value), 95 - ssCropBottom))} className="w-full accent-amber-500" />
                      <p className="text-[10px] text-muted-foreground">Moves top edge down &middot; Arrow keys = 1px</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-foreground-secondary">Crop Bottom</label>
                        <span className="text-[10px] text-muted-foreground font-mono">{Math.round(ssCropBottom / 100 * pendingSsImage.naturalHeight)}px ({ssCropBottom.toFixed(1)}%)</span>
                      </div>
                      <input type="range" min={0} max={90} step={pxStepY} value={ssCropBottom} onChange={e => setSsCropBottom(Math.min(Number(e.target.value), 95 - ssCropTop))} className="w-full accent-amber-500" />
                      <p className="text-[10px] text-muted-foreground">Moves bottom edge up &middot; Arrow keys = 1px</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-foreground-secondary">Crop Left</label>
                        <span className="text-[10px] text-muted-foreground font-mono">{Math.round(ssCropLeft / 100 * pendingSsImage.naturalWidth)}px ({ssCropLeft.toFixed(1)}%)</span>
                      </div>
                      <input type="range" min={0} max={90} step={pxStepX} value={ssCropLeft} onChange={e => setSsCropLeft(Math.min(Number(e.target.value), 95 - ssCropRight))} className="w-full accent-amber-500" />
                      <p className="text-[10px] text-muted-foreground">Moves left edge in &middot; Arrow keys = 1px</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-medium text-foreground-secondary">Crop Right</label>
                        <span className="text-[10px] text-muted-foreground font-mono">{Math.round(ssCropRight / 100 * pendingSsImage.naturalWidth)}px ({ssCropRight.toFixed(1)}%)</span>
                      </div>
                      <input type="range" min={0} max={90} step={pxStepX} value={ssCropRight} onChange={e => setSsCropRight(Math.min(Number(e.target.value), 95 - ssCropLeft))} className="w-full accent-amber-500" style={{ direction: "rtl" }} />
                      <p className="text-[10px] text-muted-foreground">Moves right edge in &middot; Arrow keys = 1px</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-amber-100">
                    <span>Original: {pendingSsImage.naturalWidth} × {pendingSsImage.naturalHeight}</span>
                    <span>Cropped: {croppedW} × {croppedH}</span>
                    {ssZoom > 1 && <span className="text-amber-600">Drag to pan at {Math.round(ssZoom * 100)}%</span>}
                  </div>
                </div>
                );
              })()}

              {uploadBranch === "screenshot" && !pendingSsImage && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Camera className="w-4 h-4 text-amber-600" />
                      <span className="text-sm font-semibold text-amber-800">Manual / Guide Image</span>
                    </div>
                    <button type="button" onClick={() => { setUploadBranch(""); setShowExistingPicker(false); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                  <p className="text-xs text-amber-700 mt-1 mb-2">Select an image file to continue.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => ssFileInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" /> Choose File
                    </Button>
                    {screenshots.length > 0 && (
                      <Button type="button" size="sm" className="text-xs bg-amber-600 hover:bg-amber-700 text-white" onClick={() => setShowExistingPicker(p => !p)}>
                        <ImageIcon className="w-3 h-3 mr-1" /> Choose Existing Image
                      </Button>
                    )}
                  </div>
                  {showExistingPicker && (
                    <div className="mt-3 border border-amber-200 rounded-lg p-3 bg-white">
                      <p className="text-xs font-medium text-amber-800 mb-2">Select from Screenshots Gallery</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                        {screenshots.map(ss => (
                          <button
                            key={ss.id}
                            type="button"
                            className="relative group rounded-md overflow-hidden border border-gray-200 hover:border-amber-400 hover:ring-2 hover:ring-amber-200 transition-all aspect-video bg-gray-100"
                            onClick={() => handlePickExisting(ss)}
                            disabled={loadingExisting === ss.id}
                          >
                            <img src={ss.imagePath} alt={ss.name} className="w-full h-full object-cover" loading="lazy" />
                            {loadingExisting === ss.id && (
                              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Loader2 className="w-5 h-5 text-white animate-spin" />
                              </div>
                            )}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-[9px] text-white truncate">{ss.name}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <input type="file" ref={heroFileInputRef} accept="image/*" className="hidden" onChange={handleHeroFileSelect} />

              {uploadBranch === "hero" && !heroPreloadedImage && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky" />
                      <span className="text-sm font-semibold text-sky-800">Hero &amp; Banner</span>
                    </div>
                    <button type="button" onClick={() => { setUploadBranch(""); setHeroPreloadedImage(null); setSiteName(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                  <p className="text-xs text-sky-700 mt-1 mb-2">Select an image to process with AI enhancer into fixed-size hero and banner variants.</p>
                  <div className="flex gap-2">
                    <Button type="button" size="sm" className="text-xs bg-sky hover:bg-sky-light text-white" onClick={() => heroFileInputRef.current?.click()}>
                      <Upload className="w-3 h-3 mr-1" /> Choose File
                    </Button>
                    {images.filter(p => p.wide).length > 0 && (
                      <Button type="button" size="sm" className="text-xs bg-sky hover:bg-sky-light text-white" onClick={() => setShowHeroPicker(p => !p)}>
                        <ImageIcon className="w-3 h-3 mr-1" /> Choose Existing Hero
                      </Button>
                    )}
                  </div>
                  {showHeroPicker && (
                    <div className="mt-3 border border-sky-200 rounded-lg p-3 bg-white">
                      <p className="text-xs font-medium text-sky-800 mb-2">Select from Hero Images</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto">
                        {images.filter(p => p.wide).map((pair, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className="relative group rounded-md overflow-hidden border border-gray-200 hover:border-sky-400 hover:ring-2 hover:ring-sky-200 transition-all aspect-video bg-gray-100"
                            onClick={() => handlePickExistingHero(pair)}
                          >
                            <img src={pair.wide} alt={pair.name || "Hero"} className="w-full h-full object-cover" loading="lazy" />
                            <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <p className="text-[9px] text-white truncate">{pair.name || "Hero"}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {uploadBranch === "hero" && heroPreloadedImage && (
                <div className="bg-sky-50 border border-sky-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-sky" />
                      <span className="text-sm font-semibold text-sky-800">Hero &amp; Banner</span>
                    </div>
                    <button type="button" onClick={() => { setUploadBranch(""); setHeroPreloadedImage(null); setSiteName(""); }} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <img
                      src={`data:${heroPreloadedImage.mimeType};base64,${heroPreloadedImage.base64}`}
                      alt="Preview"
                      className="w-32 h-24 object-cover rounded border"
                    />
                    <div className="flex-1 space-y-2">
                      <div>
                        <label className="text-xs font-medium text-foreground-secondary block mb-0.5">Site Name <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={siteName}
                          onChange={e => setSiteName(e.target.value)}
                          placeholder="e.g. Bright Mystic, Ben Nevis"
                          className="w-full p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                        />
                      </div>
                      <p className="text-[11px] text-sky-700">
                        AI enhancer will generate: hero (1920×1080), banner (1920×600), portrait (1080×1920), and slider crops.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs bg-sky hover:bg-sky-light text-white"
                      disabled={!siteName.trim()}
                      onClick={() => {
                        setSubmissionForEnhancer(null);
                        setIsEnhancerOpen(true);
                      }}
                    >
                      <Sparkles className="w-3 h-3 mr-1" /> Enhance &amp; Generate Variants
                    </Button>
                  </div>
                </div>
              )}

              {uploadBranch === "community" && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Inbox className="w-4 h-4 text-emerald-600" />
                      <span className="text-sm font-semibold text-emerald-800">Community Submissions</span>
                      {submissions.length > 0 && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-200 text-emerald-800 rounded-full">{submissions.length} {submissionFilter}</span>
                      )}
                    </div>
                    <button type="button" onClick={() => setUploadBranch("")} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                      <X className="w-3 h-3" /> Cancel
                    </button>
                  </div>
                  <div className="flex gap-2 mb-2">
                    {(["pending", "quarantined", "all"] as const).map(f => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setSubmissionFilter(f)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors ${submissionFilter === f ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-muted-foreground border-border hover:bg-muted/80"}`}
                      >
                        {f === "pending" ? "Pending" : f === "quarantined" ? "Flagged" : "All"}
                      </button>
                    ))}
                  </div>
                  {loadingSubmissions ? (
                    <div className="flex justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin text-emerald-500" />
                    </div>
                  ) : submissions.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">No {submissionFilter} submissions</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {submissions.map(sub => (
                        <div key={sub.id} className="relative border border-emerald-100 rounded-lg overflow-hidden bg-muted aspect-square group">
                          <img
                            src={submissionImageUrls[sub.id] || ""}
                            alt={sub.originalFilename}
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setSubmissionPreview(submissionImageUrls[sub.id] || "")}
                          />
                          {sub.moderationFlag && (
                            <div className="absolute top-1 left-1">
                              <div className="flex items-center gap-1 bg-amber-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                {sub.moderationFlag}
                              </div>
                            </div>
                          )}
                          {sub.status === "quarantined" && (
                            <div className="absolute top-1 left-1">
                              <div className="flex items-center gap-1 bg-red-500 text-white text-[10px] font-medium px-1.5 py-0.5 rounded">
                                <AlertTriangle className="w-3 h-3" />
                                Quarantined
                              </div>
                            </div>
                          )}
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                            <p className="text-white text-[10px] truncate">{sub.originalFilename}</p>
                            <p className="text-white/70 text-[9px]">{new Date(sub.submittedAt).toLocaleDateString()} &middot; {(sub.fileSize / 1024).toFixed(0)}KB</p>
                          </div>
                          <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              type="button"
                              onClick={() => setSubmissionPreview(submissionImageUrls[sub.id] || "")}
                              className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-emerald-600 hover:bg-emerald-500 hover:text-white"
                              title="Preview"
                            >
                              <Eye className="w-3 h-3" />
                            </button>
                            {(sub.status === "pending" || sub.status === "quarantined") && (
                              <button
                                type="button"
                                onClick={() => handleProcessSubmission(sub.id)}
                                disabled={processingSubmission === sub.id}
                                className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-sky hover:bg-sky hover:text-white disabled:opacity-50"
                                title="Process as Hero / Banner"
                              >
                                {processingSubmission === sub.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              </button>
                            )}
                            {sub.submitterIp && sub.submitterIp !== "unknown" && (
                              <button
                                type="button"
                                onClick={() => handleBanSubmissionIp(sub.id)}
                                className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-orange-500 hover:bg-orange-500 hover:text-white"
                                title={`Ban IP ${sub.submitterIp}`}
                              >
                                <ShieldBan className="w-3 h-3" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleDeleteSubmission(sub.id)}
                              className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-700"
                              title="Reject & delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          {sub.submitterIp && (
                            <div className="absolute top-8 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">{sub.submitterIp}</span>
                            </div>
                          )}
                          {sub.photographerCredit && (
                            <div className="absolute bottom-7 left-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="bg-sky/80 text-white text-[9px] px-1.5 py-0.5 rounded truncate block">© {sub.photographerCredit}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 border-t border-emerald-200">
                    <button
                      type="button"
                      onClick={() => setShowBannedIps(!showBannedIps)}
                      className="text-xs text-foreground-secondary hover:text-foreground flex items-center gap-1"
                    >
                      <ShieldBan className="w-3 h-3" />
                      {showBannedIps ? "Hide" : "Manage"} Banned IPs
                    </button>
                    {showBannedIps && (
                      <div className="mt-3 space-y-3">
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newBanIp}
                            onChange={e => setNewBanIp(e.target.value)}
                            placeholder="IP address"
                            className="flex-1 p-1.5 border border-border rounded text-xs font-mono focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                          />
                          <input
                            type="text"
                            value={newBanReason}
                            onChange={e => setNewBanReason(e.target.value)}
                            placeholder="Reason (optional)"
                            className="flex-1 p-1.5 border border-border rounded text-xs focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                          />
                          <Button type="button" onClick={handleAddBannedIp} size="sm" className="h-7 text-xs bg-orange-500 hover:bg-orange-600">
                            Ban
                          </Button>
                        </div>
                        {bannedIps.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No banned IPs</p>
                        ) : (
                          <div className="space-y-1">
                            {bannedIps.map(b => (
                              <div key={b.id} className="flex items-center justify-between bg-white rounded px-2 py-1.5 text-xs">
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-foreground">{b.ip}</span>
                                  {b.reason && <span className="text-muted-foreground">— {b.reason}</span>}
                                  <span className="text-foreground-faint">{new Date(b.bannedAt).toLocaleDateString()}</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveBannedIp(b.id)}
                                  className="text-red-400 hover:text-red-600"
                                  title="Remove ban"
                                >
                                  <ShieldOff className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {settingsLoaded && (
                    <div className="pt-2 border-t border-emerald-200">
                      <div className="flex items-center gap-1 mb-3">
                        <Settings className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs font-medium text-foreground">Submission Settings</span>
                      </div>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Bell className="w-3.5 h-3.5 text-muted-foreground" />
                            <span className="text-xs text-foreground">Email notifications</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = !submissionNotifyEnabled;
                              setSubmissionNotifyEnabled(next);
                              saveSubmissionSettings({ submissionNotifyEnabled: String(next) });
                            }}
                            className={`relative w-9 h-5 rounded-full transition-colors ${submissionNotifyEnabled ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                          >
                            <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${submissionNotifyEnabled ? "translate-x-4" : ""}`} />
                          </button>
                        </div>
                        {submissionNotifyEnabled && (
                          <div className="flex items-center gap-2 pl-5">
                            <span className="text-xs text-muted-foreground">Send at</span>
                            <select
                              value={submissionNotifyHour}
                              onChange={e => {
                                const h = parseInt(e.target.value, 10);
                                setSubmissionNotifyHour(h);
                                saveSubmissionSettings({ submissionNotifyHour: String(h) });
                              }}
                              className="p-1 border border-border rounded text-xs bg-background focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                            >
                              {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>
                                  {i === 0 ? "12:00 AM" : i < 12 ? `${i}:00 AM` : i === 12 ? "12:00 PM" : `${i - 12}:00 PM`}
                                </option>
                              ))}
                            </select>
                            <span className="text-xs text-muted-foreground">AEST/AEDT</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-foreground">Rate limit (uploads/hour)</span>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={1}
                              max={100}
                              value={submissionRateLimit}
                              onChange={e => setSubmissionRateLimit(Math.max(1, Math.min(100, parseInt(e.target.value, 10) || 1)))}
                              onBlur={() => saveSubmissionSettings()}
                              className="w-16 p-1 border border-border rounded text-xs text-center font-mono bg-background focus:ring-1 focus:ring-emerald-400 focus:border-emerald-400"
                            />
                            <span className="text-xs text-muted-foreground">per IP</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>}
        </Card>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-sky/30" />
          <span className="text-xs font-semibold text-sky uppercase tracking-wider flex items-center gap-1.5">
            <ImageIcon className="w-3.5 h-3.5" /> Fixed Size Images
          </span>
          <div className="h-px flex-1 bg-sky/30" />
        </div>

        <Card className="mb-6 overflow-hidden border-sky/30">
          <button type="button" onClick={() => toggleSection("fixedSize")} className="w-full text-left">
            <CardHeader className="py-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-sky/10 rounded-lg flex items-center justify-center">
                    <ImageIcon className="w-4 h-4 text-sky" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Fixed Size Images</CardTitle>
                    <CardDescription className="mt-0.5">Hero, Banner, Landscape Large &amp; Small, and Portrait Ratios</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {expandedSections.has("fixedSize") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
          </button>
          {expandedSections.has("fixedSize") && <CardContent className="border-t border-border pt-4 space-y-3">

        <div className="border rounded-lg overflow-hidden">
          <button type="button" onClick={() => toggleSection("hero")} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Hero Images (1920 x 1080)</p>
                <p className="text-xs text-muted-foreground mt-0.5">Used for home page backgrounds.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{wideImages.length} images</span>
                {expandedSections.has("hero") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
          {expandedSections.has("hero") && <div className="border-t border-border px-4 py-4">
              {wideImages.length === 0 ? (
                <p className="text-sm text-foreground-faint text-center py-8">No hero images yet. Upload or add a URL above.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {wideImages.map(({ pair, originalIndex }) => (
                    <div key={`wide-${originalIndex}`} className="relative border rounded-lg overflow-hidden bg-muted aspect-video group">
                      <img
                        src={pair.wide}
                        alt={pair.name || `Hero ${originalIndex + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => setLightboxSrc(pair.wide)}
                      />
                      {pair.name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                          <p className="text-white text-xs font-medium truncate">{pair.name}</p>
                        </div>
                      )}
                      <div className="absolute top-1 left-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetCategory(originalIndex, "coastal")}
                          title="Coastal"
                          className={`w-6 h-6 rounded-md shadow-sm flex items-center justify-center transition-colors ${pair.category === "coastal" ? "bg-sky text-white" : "bg-white/90 text-foreground-faint hover:text-sky hover:bg-card"}`}
                        >
                          <Waves className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetCategory(originalIndex, "inland")}
                          title="Inland"
                          className={`w-6 h-6 rounded-md shadow-sm flex items-center justify-center transition-colors ${pair.category === "inland" ? "bg-emerald-500 text-white" : "bg-white/90 text-foreground-faint hover:text-emerald-500 hover:bg-card"}`}
                        >
                          <Mountain className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSiteName(pair.name || "");
                            setInitialHeroImage(pair.wide);
                            setIsEnhancerOpen(true);
                          }}
                          title="Generate Banner & Sliders"
                          className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-sky hover:bg-sky-50 hover:text-sky-700"
                        >
                          <Scissors className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveWide(originalIndex)}
                          className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>}
        </div>

        <div className="border rounded-lg overflow-hidden">
          <button type="button" onClick={() => toggleSection("banner")} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Banner Images (1920 x 600)</p>
                <p className="text-xs text-muted-foreground mt-0.5">Used for site page headers (1920×600). Created during the crop wizard.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{bannerImages.length} images</span>
                {expandedSections.has("banner") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>
          </button>
          {expandedSections.has("banner") && <div className="border-t border-border px-4 py-4">
              {bannerImages.length === 0 ? (
                <p className="text-sm text-foreground-faint text-center py-8">No banner images yet. Upload an image to start the crop wizard.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {bannerImages.map(({ pair, originalIndex }) => (
                    <div key={`banner-${originalIndex}`} className="relative border rounded-lg overflow-hidden bg-muted aspect-[16/5]">
                      <img
                        src={pair.banner}
                        alt={pair.name || `Banner ${originalIndex + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => setLightboxSrc(pair.banner)}
                      />
                      {pair.name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1">
                          <p className="text-white text-[10px] font-medium truncate">{pair.name}</p>
                        </div>
                      )}
                      {pair.category && (
                        <div className="absolute top-1 left-1">
                          <div className={`w-5 h-5 rounded-md flex items-center justify-center ${pair.category === "coastal" ? "bg-sky text-white" : "bg-emerald-500 text-white"}`}>
                            {pair.category === "coastal" ? <Waves className="w-3 h-3" /> : <Mountain className="w-3 h-3" />}
                          </div>
                        </div>
                      )}
                      <div className="absolute top-1 right-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveBanner(originalIndex)}
                          className="w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>}
        </div>

        {wideImages.some(({ pair }) => !pair.sliderLg || !pair.sliderSm || !pair.sliderPortrait) && (
          <div className="flex justify-end mt-3">
            <Button
              type="button"
              onClick={handleGenerateAllSliders}
              disabled={generatingSliders}
              className="bg-sky hover:bg-sky-light text-white"
            >
              {generatingSliders ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</> : <><ImageIcon className="w-4 h-4 mr-2" /> Generate Missing Slider Images</>}
            </Button>
          </div>
        )}

        {[
          { label: "Landscape Large (600 × 400)", sectionId: "sliderLg", field: "sliderLg" as const, enabledKey: "sliderLgEnabled" as const, w: 240, h: 160 },
          { label: "Landscape Small (450 × 300)", sectionId: "sliderSm", field: "sliderSm" as const, enabledKey: "sliderSmEnabled" as const, w: 195, h: 130 },
          { label: "Portrait (267 × 400)", sectionId: "sliderPortrait", field: "sliderPortrait" as const, enabledKey: "sliderPortraitEnabled" as const, w: 120, h: 180 },
        ].map(({ label, sectionId, field, enabledKey, w, h }) => {
          const items = sliderImages.filter(({ pair }) => pair[field]);
          if (items.length === 0) return null;
          return (
            <div key={sectionId} className="border rounded-lg overflow-hidden">
              <button type="button" onClick={() => toggleSection(sectionId)} className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-medium">{label}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{items.length} images</span>
                    {expandedSections.has(sectionId) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </div>
                </div>
              </button>
              {expandedSections.has(sectionId) && <div className="border-t border-border px-4 py-4">
                <div className="flex flex-wrap gap-3">
                  {items.map(({ pair, originalIndex }) => (
                    <div key={`${field}-${originalIndex}`} className="relative border rounded-lg overflow-hidden bg-muted shrink-0 group" style={{ width: w, height: h }}>
                      <img
                        src={pair[field]!}
                        alt={`${pair.name || "Image"} ${label}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => setLightboxSrc(pair[field]!)}
                      />
                      {pair.name && (
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                          <p className="text-white text-xs font-medium truncate">{pair.name}</p>
                        </div>
                      )}
                      <div className="absolute top-1 left-1 flex gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetCategory(originalIndex, "coastal")}
                          title="Coastal"
                          className={`w-6 h-6 rounded-md shadow-sm flex items-center justify-center transition-colors ${pair.category === "coastal" ? "bg-sky text-white" : "bg-white/90 text-foreground-faint hover:text-sky hover:bg-card"}`}
                        >
                          <Waves className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetCategory(originalIndex, "inland")}
                          title="Inland"
                          className={`w-6 h-6 rounded-md shadow-sm flex items-center justify-center transition-colors ${pair.category === "inland" ? "bg-emerald-500 text-white" : "bg-white/90 text-foreground-faint hover:text-emerald-500 hover:bg-card"}`}
                        >
                          <Mountain className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleSlider(originalIndex, field)}
                          title={pair[enabledKey] !== false ? "Remove from carousel" : "Add to carousel"}
                          className={`w-6 h-6 rounded-md shadow-sm flex items-center justify-center transition-colors ${pair[enabledKey] !== false ? "bg-amber-500 text-white" : "bg-white/90 text-foreground-faint hover:text-amber-500 hover:bg-card"}`}
                        >
                          <GalleryHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSliderImage(originalIndex, field)}
                        className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-md shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          );
        })}

          </CardContent>}
        </Card>

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-amber-300" />
          <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1.5">
            <Camera className="w-3.5 h-3.5" /> Variable Size Images
          </span>
          <div className="h-px flex-1 bg-amber-300" />
        </div>

        <Card className="mb-6 overflow-hidden border-amber-400/30">
          <button type="button" onClick={() => toggleSection("screenshots")} className="w-full text-left">
            <CardHeader className="py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                    <Camera className="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Variable Size Images</CardTitle>
                    <CardDescription className="mt-0.5">{screenshots.length} images &middot; For manuals, procedures, site guides</CardDescription>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{screenshots.length} images</span>
                  {expandedSections.has("screenshots") ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                </div>
              </div>
            </CardHeader>
          </button>
          {expandedSections.has("screenshots") && (
            <CardContent className="border-t border-border pt-4 space-y-3">
              <div className="flex gap-2 items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search screenshots..."
                    value={ssSearch}
                    onChange={e => setSsSearch(e.target.value)}
                    className="w-full pl-8 p-1.5 border border-border rounded-md text-sm focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                  />
                </div>
                <div className="flex border border-border rounded-md overflow-hidden">
                  <button type="button" className={`px-2 py-1.5 ${ssViewMode === "grid" ? "bg-amber-100 text-amber-700" : "bg-background text-muted-foreground"}`} onClick={() => setSsViewMode("grid")}>
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button type="button" className={`px-2 py-1.5 ${ssViewMode === "list" ? "bg-amber-100 text-amber-700" : "bg-background text-muted-foreground"}`} onClick={() => setSsViewMode("list")}>
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex gap-1.5 flex-wrap">
                {["All", ...SCREENSHOT_CATEGORIES].map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSsFilterCategory(cat)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      ssFilterCategory === cat
                        ? "bg-amber-100 text-amber-700 border border-amber-300"
                        : "bg-muted text-muted-foreground hover:bg-muted/80 border border-transparent"
                    }`}
                  >
                    {cat === "Admin Manual" && <BookOpen className="w-3 h-3 inline mr-0.5" />}
                    {cat === "Procedure Manual" && <FileText className="w-3 h-3 inline mr-0.5" />}
                    {cat === "Site Guides" && <MapPin className="w-3 h-3 inline mr-0.5" />}
                    {cat === "Home Page" && <Monitor className="w-3 h-3 inline mr-0.5" />}
                    {cat}
                  </button>
                ))}
              </div>

              {filteredScreenshots.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {screenshots.length === 0
                    ? "No guide images yet. Upload one using the \"Manual / Guide Image\" workflow above."
                    : "No screenshots match your search/filter."}
                </p>
              ) : ssViewMode === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {filteredScreenshots.map(s => {
                    const tag = `{{screenshot:${s.id}}}`;
                    return (
                      <div key={s.id} className="group border rounded-lg overflow-hidden bg-muted hover:shadow-md transition-shadow">
                        <div className="relative aspect-[4/3] bg-muted">
                          <img src={s.imagePath} alt={s.name} className="w-full h-full object-cover cursor-pointer" onClick={() => setLightboxSrc(s.imagePath)} loading="lazy" />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                            <button type="button" className="p-1.5 bg-white rounded-md shadow-sm hover:bg-muted" onClick={() => setLightboxSrc(s.imagePath)}>
                              <ZoomIn className="w-4 h-4 text-foreground-label" />
                            </button>
                            <button type="button" className="p-1.5 bg-white rounded-md shadow-sm hover:bg-muted" onClick={() => handleDeleteScreenshot(s.id)}>
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </button>
                          </div>
                          <span className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-mono">
                            {s.width}×{s.height}
                          </span>
                          <span className="absolute bottom-1.5 left-1.5 bg-amber-500/90 text-white text-[9px] px-1.5 py-0.5 rounded font-medium">
                            {s.category}
                          </span>
                        </div>
                        <div className="p-2 bg-card">
                          <p className="text-xs font-medium text-foreground truncate">{s.name}</p>
                          <div className="flex items-center justify-between mt-1">
                            <code className="text-[9px] text-muted-foreground font-mono truncate max-w-[60%]">{tag}</code>
                            <button
                              type="button"
                              className="flex items-center gap-0.5 text-[10px] text-amber-600 hover:text-amber-800 font-medium shrink-0"
                              onClick={() => handleCopyTag(tag)}
                            >
                              {copiedTag === tag ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                              {copiedTag === tag ? "Copied!" : "Copy tag"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredScreenshots.map(s => {
                    const tag = `{{screenshot:${s.id}}}`;
                    return (
                      <div key={s.id} className="flex items-center gap-3 p-2 border rounded-lg bg-card hover:bg-muted/50 group">
                        <img src={s.imagePath} alt={s.name} className="w-16 h-12 object-cover rounded cursor-pointer" onClick={() => setLightboxSrc(s.imagePath)} loading="lazy" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">{s.name}</p>
                          <p className="text-[10px] text-muted-foreground">{s.category} &middot; {s.width}×{s.height} &middot; {s.dateAdded}</p>
                        </div>
                        <code className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded shrink-0">{tag}</code>
                        <div className="flex gap-1 shrink-0">
                          <button type="button" className="p-1 hover:bg-muted rounded" onClick={() => handleCopyTag(tag)}>
                            {copiedTag === tag ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground" />}
                          </button>
                          <button type="button" className="p-1 hover:bg-muted rounded" onClick={() => handleDeleteScreenshot(s.id)}>
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </CardContent>
          )}
        </Card>
      </div>

      <AIImageEnhancerModal
        isOpen={isEnhancerOpen}
        onClose={() => { setIsEnhancerOpen(false); setInitialHeroImage(undefined); setSiteName(""); setSubmissionForEnhancer(null); setHeroPreloadedImage(null); if (uploadBranch === "hero") setUploadBranch(""); }}
        onAccept={submissionForEnhancer ? handleSubmissionEnhancerAccept : handleEnhancedAccept}
        existingHeroImages={images.filter(p => p.wide).map(p => p.wide)}
        imageName={siteName}
        onImageNameChange={setSiteName}
        preloadedImage={submissionForEnhancer || heroPreloadedImage}
        initialPhotographerCredit={submissionForEnhancer?.photographerCredit || urlPhotographerCredit}
        onPhotographerCreditChange={setUrlPhotographerCredit}
        initialHeroImage={initialHeroImage}
      />


      {processingUrl && !isEnhancerOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card rounded-2xl shadow-2xl p-8 text-center space-y-4">
            <Loader2 className="w-10 h-10 text-sky mx-auto animate-spin" />
            <p className="text-navy font-medium">Processing image...</p>
          </div>
        </div>
      )}

      <div className="flex justify-end mt-6">
        <Button
          type="button"
          onClick={handleSave}
          disabled={!hasUnsavedChanges && !justSaved}
          className={`h-10 px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : hasUnsavedChanges ? "bg-navy hover:bg-navy-light" : "bg-muted cursor-not-allowed"} text-white`}
        >
          {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save Changes</>}
        </Button>
      </div>

      {lightboxSrc && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-card rounded-full flex items-center justify-center shadow-lg z-10"
          >
            <X className="w-5 h-5 text-foreground-label" />
          </button>
          <img
            src={lightboxSrc}
            alt="Full resolution preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
            referrerPolicy="no-referrer"
          />
        </div>
      )}

      {submissionPreview && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setSubmissionPreview(null)}
        >
          <button
            type="button"
            onClick={() => setSubmissionPreview(null)}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 hover:bg-card rounded-full flex items-center justify-center shadow-lg z-10"
          >
            <X className="w-5 h-5 text-foreground-label" />
          </button>
          <img
            src={submissionPreview}
            alt="Submission preview"
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <BulkUploadDialog
        open={isBulkUploadDialogOpen}
        onOpenChange={setIsBulkUploadDialogOpen}
        token={token}
        onAccept={handleBulkUploadAccept}
      />

      <UnsavedChangesModal blocker={blocker} onSave={handleSave} />
    </div>
  );
}
