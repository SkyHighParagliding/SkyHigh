import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ArrowLeft, Save, Trash2, Image as ImageIcon, RefreshCw, Star, GraduationCap, Check, MessageCircle, Tags, Copy, ExternalLink, Share2, Plus, Play, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from "lucide-react";
import { socialLinks } from "@/components/SocialIcons";
import { MarkdownHelpLink } from "@/components/MarkdownHelpLink";
import { HomePageMapContent, HomePageMapIcon } from "@/components/HomePageMapPopup";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useSettings } from "@/contexts/SettingsContext";
import { useHomeSettings, extractYoutubeVideoId } from "@/hooks/useHomeSettings";

export function AdminHomeSettings() {
  const {
    settings, loading, sites, formData, setFormData,
    customCards, schools, sponsors,
    telegramGroups, youtubeVideos, instagramEmbeds,
    newSchoolName, setNewSchoolName, newSchoolUrl, setNewSchoolUrl,
    newTelegramName, setNewTelegramName, newTelegramUrl, setNewTelegramUrl,
    newYoutubeUrl, setNewYoutubeUrl, youtubeUrlError, setYoutubeUrlError,
    newInstaEmbed, setNewInstaEmbed, instaEmbedError, setInstaEmbedError,
    ytChannelUrl, setYtChannelUrl, ytScraping, ytScrapeResult,
    expandedSections, toggleSection,
    customWidgetTags, newTagName, setNewTagName,
    newTagSource, setNewTagSource, newTagSelection, setNewTagSelection,
    editingTagIdx, editTagSelection, setEditTagSelection,
    saveMessageRef, markDirty, blocker, justSaved,
    handleChange, handleSubmit, saveSettings,
    heroLibraryImages, toggleHeroImage, setStaticImage,
    toggleCardSelection, cardOptions,
    updateCustomCard, removeCustomCard, addCustomCard,
    addSchool, updateSchool, removeSchool,
    addTelegramGroup, updateTelegramGroup, removeTelegramGroup,
    addYoutubeVideo, moveYoutubeVideo, removeYoutubeVideo, scrapeYoutubeChannel,
    addInstagramEmbed, moveInstagramEmbed, removeInstagramEmbed,
    addCustomTag, toggleEditTag, deleteCustomTag, saveEditTag,
    setWeatherCardCount,
  } = useHomeSettings();

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex gap-4 mb-6">
          <Link to="/admin" className="inline-flex items-center text-sky hover:text-sky-light font-medium">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Dashboard
          </Link>
        </div>

        <h1 className="text-3xl font-extrabold text-navy mb-8">Home Page Management</h1>

        <form onSubmit={handleSubmit} onChange={markDirty} className="space-y-8">
          <div className="flex justify-end">
            <Button
              type="submit"
              className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
              disabled={loading}
            >
              {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save All Settings</>}
            </Button>
          </div>

          {/* Page Layout Map */}
          <Card className="border-t-4 border-t-indigo-400 overflow-hidden">
            <button type="button" onClick={() => toggleSection("layoutmap")} className="w-full text-left">
              <CardHeader className="py-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <HomePageMapIcon /> Page Layout Map
                    </CardTitle>
                  </div>
                  {expandedSections.has("layoutmap") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("layoutmap") && <CardContent className="border-t border-border pt-4 pb-4">
              <HomePageMapContent />
            </CardContent>}
          </Card>

          {/* Alert Banner Section */}
          <Card className="border-t-4 border-t-orange overflow-hidden">
            <button type="button" onClick={() => toggleSection("alert")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-orange" /> Alert Banner
                    </CardTitle>
                    <CardDescription className="mt-1">Display an urgent notification at the very top of the home page.</CardDescription>
                  </div>
                  {expandedSections.has("alert") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("alert") && <CardContent className="space-y-4 border-t border-border pt-4">
              <div className="flex items-center gap-4 mb-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="alertBannerEnabled" 
                    value="true" 
                    checked={formData.alertBannerEnabled === true}
                    onChange={() => setFormData(prev => ({ ...prev, alertBannerEnabled: true }))}
                    className="w-4 h-4 text-orange focus:ring-orange"
                  />
                  <span className="text-sm font-medium">Enabled</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input 
                    type="radio" 
                    name="alertBannerEnabled" 
                    value="false" 
                    checked={formData.alertBannerEnabled === false}
                    onChange={() => setFormData(prev => ({ ...prev, alertBannerEnabled: false }))}
                    className="w-4 h-4 text-orange focus:ring-orange"
                  />
                  <span className="text-sm font-medium">Disabled</span>
                </label>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Banner Text</label>
                <input 
                  type="text" 
                  name="alertBannerText" 
                  value={formData.alertBannerText} 
                  onChange={handleChange}
                  placeholder="e.g. Site maintenance at Flinders this weekend."
                  className="w-full p-2 border rounded-md focus:ring-orange focus:border-orange"
                />
              </div>
            </CardContent>}
          </Card>

          <Card className="border-t-4 border-t-sky overflow-hidden">
            <button type="button" onClick={() => toggleSection("hero")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Hero Section</CardTitle>
                    <CardDescription className="mt-1">Title, subtitle, buttons & background images.</CardDescription>
                  </div>
                  {expandedSections.has("hero") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("hero") && <CardContent className="space-y-4 border-t border-border pt-4">

              <div className="border rounded-lg bg-muted/30">
                <button type="button" onClick={() => toggleSection("herocontent")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    Content & Buttons
                  </h4>
                  {expandedSections.has("herocontent") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("herocontent") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Manage the main title, subtitle, and call-to-action buttons displayed on the home page.</p>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Hero Title</label>
                <input 
                  type="text" 
                  name="homeHeroTitle" 
                  value={formData.homeHeroTitle} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Hero Subtitle</label>
                <textarea 
                  name="homeHeroSubtitle" 
                  value={formData.homeHeroSubtitle} 
                  onChange={handleChange}
                  rows={3}
                  className="w-full p-2 border rounded-md focus:ring-sky focus:border-sky"
                />
              </div>

                  <div className="pt-4 border-t border-border/50">
                    <h5 className="font-bold text-navy text-sm uppercase tracking-wider mb-3">Call to Action Buttons</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-4 border p-4 rounded-lg bg-background">
                        <h4 className="font-bold text-navy text-sm uppercase tracking-wider">Primary Button (Orange)</h4>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Button Text</label>
                          <input 
                            type="text" 
                            name="homeCta1Text" 
                            value={formData.homeCta1Text} 
                            onChange={handleChange}
                            className="w-full p-2 border rounded-md"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                          <input 
                            type="text" 
                            name="homeCta1Link" 
                            value={formData.homeCta1Link} 
                            onChange={handleChange}
                            className="w-full p-2 border rounded-md"
                          />
                        </div>
                      </div>
                      <div className="space-y-4 border p-4 rounded-lg bg-background">
                        <h4 className="font-bold text-navy text-sm uppercase tracking-wider">Secondary Button (Outline)</h4>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Button Text</label>
                          <input 
                            type="text" 
                            name="homeCta2Text" 
                            value={formData.homeCta2Text} 
                            onChange={handleChange}
                            className="w-full p-2 border rounded-md"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                          <input 
                            type="text" 
                            name="homeCta2Link" 
                            value={formData.homeCta2Link} 
                            onChange={handleChange}
                            className="w-full p-2 border rounded-md"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>}
              </div>

              <div className="border rounded-lg bg-muted/30">
                <button type="button" onClick={() => toggleSection("bgimages")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Background Images
                  </h4>
                  {expandedSections.has("bgimages") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("bgimages") && <div className="px-4 pb-4 space-y-6 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Select images from the library to use as hero backgrounds. <Link to="/admin/images" className="text-sky hover:underline" onClick={(e) => e.stopPropagation()}>Manage Image Library</Link></p>
              {heroLibraryImages.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-sm text-foreground-faint mb-3">No images in the library yet.</p>
                  <Link to="/admin/images">
                    <Button type="button" className="bg-navy hover:bg-navy-light text-white">
                      <ImageIcon className="w-4 h-4 mr-2" /> Go to Image Library
                    </Button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {heroLibraryImages.map((url, index) => {
                      const isSelected = formData.homeHeroImages.includes(url);
                      return (
                        <div key={index} onClick={() => toggleHeroImage(url)} className={`relative border-2 rounded-lg overflow-hidden bg-muted aspect-video cursor-pointer transition-all ${isSelected ? "border-sky ring-2 ring-sky/30" : "border-border-subtle hover:border-gray-400"}`}>
                          <img src={url} alt={`Library ${index + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
                          {isSelected && <div className="absolute top-1 left-1 bg-sky text-white text-[9px] font-bold px-1.5 py-0.5 rounded uppercase">Selected</div>}
                          {formData.homeHeroImageMode === 'static' && isSelected && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); setStaticImage(formData.homeHeroImages.indexOf(url)); }} className={`absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${formData.homeHeroStaticImageIndex === formData.homeHeroImages.indexOf(url) ? "bg-orange text-white" : "bg-white/90 text-foreground-secondary hover:bg-orange/20"}`}>
                              {formData.homeHeroStaticImageIndex === formData.homeHeroImages.indexOf(url) ? "Active" : "Set Active"}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-foreground-faint">Click images to select/deselect them for the hero rotation. {formData.homeHeroImages.length} of {heroLibraryImages.length} selected.</p>
                </>
              )}

              <div className="pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-base font-semibold text-navy">Display Mode</label>
                    <p className="text-sm text-muted-foreground">Choose how images are served to visitors.</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="homeHeroImageMode" 
                        value="static" 
                        checked={formData.homeHeroImageMode === 'static'}
                        onChange={handleChange}
                        className="w-4 h-4 text-sky focus:ring-sky"
                      />
                      <span className="text-sm font-medium">Static</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="radio" 
                        name="homeHeroImageMode" 
                        value="random" 
                        checked={formData.homeHeroImageMode === 'random'}
                        onChange={handleChange}
                        className="w-4 h-4 text-sky focus:ring-sky"
                      />
                      <span className="text-sm font-medium">Random on refresh</span>
                    </label>
                  </div>
                </div>
              </div>
                </div>}
              </div>

              <div className="border rounded-lg bg-sky-50/30">
                <button type="button" onClick={() => toggleSection("smartassistant")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-sky" /> Smart Assistant
                  </h4>
                  {expandedSections.has("smartassistant") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("smartassistant") && <div className="px-4 pb-4 border-t border-border/50">
                  <div className="flex items-center justify-between pt-3">
                    <p className="text-xs text-muted-foreground">Disclaimer, CTA message & prompt are configured in Connection settings.</p>
                    <Link
                      to="/admin/connections#smart-assistant"
                      className="text-sm text-sky hover:text-navy font-medium inline-flex items-center gap-1 transition-colors shrink-0"
                    >
                      Smart Assistant Settings <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>}
              </div>

            </CardContent>}
          </Card>

          {/* Quick Action Cards Section */}
          <Card className="border-t-4 border-t-emerald-500 overflow-hidden">
            <button type="button" onClick={() => toggleSection("quickcards")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Quick Action Cards</CardTitle>
                    <CardDescription className="mt-1">Manage the cards displayed below the hero section. Choose which cards to show, edit their titles, descriptions, and link destinations.</CardDescription>
                  </div>
                  {expandedSections.has("quickcards") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("quickcards") && <CardContent className="space-y-6 border-t border-border pt-4">
              <div className="space-y-4 border-b pb-6">
                <h3 className="text-sm font-bold text-navy">Card Display Settings</h3>
                <div className="flex items-center gap-2 mb-4">
                  <input
                    type="checkbox"
                    id="homeCardsCycle"
                    checked={formData.homeCardsCycle}
                    onChange={(e) => setFormData(prev => ({ ...prev, homeCardsCycle: e.target.checked }))}
                    className="rounded text-orange focus:ring-orange"
                  />
                  <label htmlFor="homeCardsCycle" className="text-sm font-medium text-foreground-label">
                    Cycle cards on page refresh
                  </label>
                </div>

                {formData.homeCardsCycle && (
                  <div className="space-y-2 ml-6 p-3 bg-orange-50 rounded-lg border border-orange-100">
                    <label className="text-sm font-medium text-foreground-label">Pin one card (always visible on every refresh):</label>
                    <select
                      value={formData.homeCardsCyclePinned}
                      onChange={(e) => setFormData(prev => ({ ...prev, homeCardsCyclePinned: e.target.value }))}
                      className="w-full p-2 border rounded-md text-sm focus:ring-orange focus:border-orange"
                    >
                      <option value="">None (all cards rotate)</option>
                      {cardOptions.map(card => (
                        <option key={card.id} value={card.id}>{card.label}</option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground italic">The pinned card is always shown. The remaining slots rotate randomly on each page refresh.</p>
                  </div>
                )}
                
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground-label">Select 3 cards to display (if cycling is disabled):</label>
                  <div className="grid grid-cols-2 gap-2">
                    {cardOptions.map(card => (
                      <label key={card.id} className="flex items-center gap-2 p-2 border rounded hover:bg-background cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.homeCardsSelection.includes(card.id)}
                          onChange={() => toggleCardSelection(card.id)}
                          disabled={!formData.homeCardsSelection.includes(card.id) && formData.homeCardsSelection.length >= 3}
                          className="rounded text-orange focus:ring-orange"
                        />
                        <span className="text-sm font-medium text-foreground-label">{card.label}</span>
                      </label>
                    ))}
                  </div>
                  {formData.homeCardsSelection.length < 3 && (
                    <p className="text-xs text-orange">Please select exactly 3 cards.</p>
                  )}
                  <p className="text-xs text-muted-foreground italic">If the Events card is selected but no upcoming events exist, the site will automatically replace it with another card.</p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Edit Individual Cards</h3>

                <div className="border rounded-lg bg-sky-50/30">
                  <button type="button" onClick={() => toggleSection("card_sites")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                    <h4 className="font-bold text-navy flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-sky"></span> Flying Sites Card
                    </h4>
                    {expandedSections.has("card_sites") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("card_sites") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                        <input type="text" name="homeCardSitesTitle" value={formData.homeCardSitesTitle} onChange={handleChange} placeholder="Flying Sites" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                        <input type="text" name="homeCardSitesLink" value={formData.homeCardSitesLink} onChange={handleChange} placeholder="/sites" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                        <input type="text" name="homeCardSitesLinkText" value={formData.homeCardSitesLinkText} onChange={handleChange} placeholder="View Sites" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <textarea name="homeBox1Desc" value={formData.homeBox1Desc || "Detailed information on all our coastal and inland flying sites, including weather requirements and hazards."} onChange={handleChange} rows={2} className="w-full p-2 border rounded-md text-sm" />
                      <div className="flex justify-end"><MarkdownHelpLink compact /></div>
                    </div>
                  </div>}
                </div>

                <div className="border rounded-lg bg-orange-50/30">
                  <button type="button" onClick={() => toggleSection("card_safety")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                    <h4 className="font-bold text-navy flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange"></span> Safety & Rules Card
                    </h4>
                    {expandedSections.has("card_safety") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("card_safety") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                        <input type="text" name="homeCardSafetyTitle" value={formData.homeCardSafetyTitle} onChange={handleChange} placeholder="Safety & Rules" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                        <input type="text" name="homeCardSafetyLink" value={formData.homeCardSafetyLink} onChange={handleChange} placeholder="/safety" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                        <input type="text" name="homeCardSafetyLinkText" value={formData.homeCardSafetyLinkText} onChange={handleChange} placeholder="Safety Guidelines" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <textarea name="homeBox2Desc" value={formData.homeBox2Desc || "Please see our Safety Guidelines. Review site rules, acknowledge hazards, and fly safely."} onChange={handleChange} rows={2} className="w-full p-2 border rounded-md text-sm" />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground italic">If online check-in is enabled, a mandatory check-in notice is automatically prepended.</p>
                        <MarkdownHelpLink compact />
                      </div>
                    </div>
                  </div>}
                </div>

                <div className="border rounded-lg bg-slate-50">
                  <button type="button" onClick={() => toggleSection("card_community")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                    <h4 className="font-bold text-navy flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-navy"></span> Community Card
                    </h4>
                    {expandedSections.has("card_community") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("card_community") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                        <input type="text" name="homeCardCommunityTitle" value={formData.homeCardCommunityTitle} onChange={handleChange} placeholder="Community" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                        <input type="text" name="homeCardCommunityLink" value={formData.homeCardCommunityLink} onChange={handleChange} placeholder="/page/about" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                        <input type="text" name="homeCardCommunityLinkText" value={formData.homeCardCommunityLinkText} onChange={handleChange} placeholder="About Us" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <textarea name="homeBox3Desc" value={formData.homeBox3Desc || "We regularly meet on the first Wednesday of each month. We fly whenever its on! Connect with local pilots and find mentors."} onChange={handleChange} rows={2} className="w-full p-2 border rounded-md text-sm" />
                      <div className="flex justify-end"><MarkdownHelpLink compact /></div>
                    </div>
                  </div>}
                </div>

                <div className="border rounded-lg bg-purple-50/30">
                  <button type="button" onClick={() => toggleSection("card_committee")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                    <h4 className="font-bold text-navy flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-purple-600"></span> Your Committee
                    </h4>
                    {expandedSections.has("card_committee") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("card_committee") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                        <input type="text" name="homeCardCommitteeTitle" value={formData.homeCardCommitteeTitle} onChange={handleChange} placeholder="Your Committee" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                        <input type="text" name="homeCardCommitteeLink" value={formData.homeCardCommitteeLink} onChange={handleChange} placeholder="/page/committee" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                        <input type="text" name="homeCardCommitteeLinkText" value={formData.homeCardCommitteeLinkText} onChange={handleChange} placeholder="Meet the Team" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Description</label>
                      <textarea name="homeCardCommitteeDesc" value={formData.homeCardCommitteeDesc || "Meet the people who keep the club running. {{committee}}"} onChange={handleChange} rows={3} className="w-full p-2 border rounded-md text-sm font-mono" />
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-muted-foreground italic">The {"{{committee}}"} tag will render committee member cards from your contacts directory.</p>
                        <MarkdownHelpLink />
                      </div>
                    </div>
                  </div>}
                </div>

                <div className="border rounded-lg bg-emerald-50/30">
                  <button type="button" onClick={() => toggleSection("card_events")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                    <h4 className="font-bold text-navy flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-emerald-600"></span> Upcoming Events Card
                    </h4>
                    {expandedSections.has("card_events") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                  </button>
                  {expandedSections.has("card_events") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                        <input type="text" name="homeCardEventsTitle" value={formData.homeCardEventsTitle} onChange={handleChange} placeholder="Upcoming Events" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Fallback Link Path</label>
                        <input type="text" name="homeCardEventsLink" value={formData.homeCardEventsLink} onChange={handleChange} placeholder="/events" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                        <input type="text" name="homeCardEventsLinkText" value={formData.homeCardEventsLinkText} onChange={handleChange} placeholder="View Event" className="w-full p-2 border rounded-md text-sm" />
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground italic">The Events card automatically displays the next upcoming event image, name, and date from TidyHQ. If no events exist, this card is hidden and replaced with another card.</p>
                  </div>}
                </div>

                {customCards.map((cc, idx) => (
                  <div key={idx} className="border rounded-lg bg-background">
                    <button type="button" onClick={() => toggleSection(`card_custom_${idx}`)} className="w-full text-left px-4 py-3 flex items-center justify-between">
                      <h4 className="font-bold text-navy flex items-center gap-2">
                        <Star className={`w-4 h-4 ${{sky:'text-sky',orange:'text-orange',navy:'text-navy',emerald:'text-emerald-600',purple:'text-purple-600',pink:'text-pink-600',red:'text-red-600',indigo:'text-indigo-600'}[cc.color] || 'text-sky'}`} />
                        {cc.title || 'Custom Card'}
                      </h4>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeCustomCard(idx); }}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        {expandedSections.has(`card_custom_${idx}`) ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      </div>
                    </button>
                    {expandedSections.has(`card_custom_${idx}`) && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Card Title</label>
                          <input type="text" value={cc.title} onChange={(e) => updateCustomCard(idx, 'title', e.target.value)} className="w-full p-2 border rounded-md text-sm" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Link Path</label>
                          <input type="text" value={cc.link} onChange={(e) => updateCustomCard(idx, 'link', e.target.value)} placeholder="/page/slug" className="w-full p-2 border rounded-md text-sm" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Link Text</label>
                          <input type="text" value={cc.linkText} onChange={(e) => updateCustomCard(idx, 'linkText', e.target.value)} placeholder="Learn More" className="w-full p-2 border rounded-md text-sm" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Color</label>
                          <select value={cc.color} onChange={(e) => updateCustomCard(idx, 'color', e.target.value)} className="w-full p-2 border rounded-md text-sm">
                            <option value="sky">Sky Blue</option>
                            <option value="orange">Orange</option>
                            <option value="navy">Navy</option>
                            <option value="emerald">Emerald</option>
                            <option value="purple">Purple</option>
                            <option value="pink">Pink</option>
                            <option value="red">Red</option>
                            <option value="indigo">Indigo</option>
                          </select>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-muted-foreground">Description</label>
                        <textarea value={cc.description} onChange={(e) => updateCustomCard(idx, 'description', e.target.value)} rows={2} className="w-full p-2 border rounded-md text-sm" />
                        <div className="flex justify-end"><MarkdownHelpLink compact /></div>
                      </div>
                    </div>}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addCustomCard}
                  className="w-full border-2 border-dashed border-border rounded-lg p-4 text-muted-foreground hover:border-sky hover:text-sky transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Add Custom Card
                </button>
              </div>

            </CardContent>}
          </Card>

          <Card className="border-t-4 border-t-amber-500 overflow-hidden">
            <button type="button" onClick={() => toggleSection("widgets")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Tags className="w-5 h-5 text-amber-600" /> Widgets
                    </CardTitle>
                    <CardDescription className="mt-1">Schools, Telegram & Custom widget tags.</CardDescription>
                  </div>
                  {expandedSections.has("widgets") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("widgets") && <CardContent className="space-y-4 border-t border-border pt-4">

              <div className="border rounded-lg bg-purple-50/30">
                <button type="button" onClick={() => toggleSection("schools")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <GraduationCap className="w-4 h-4 text-purple-600" /> Paragliding Schools
                  </h4>
                  {expandedSections.has("schools") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("schools") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Manage the list of paragliding schools displayed on the home page card. Randomised on each page refresh.</p>
                  <div className="space-y-2">
                    {schools.map((school, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={school.name}
                            onChange={(e) => updateSchool(idx, 'name', e.target.value)}
                            placeholder="Short name (e.g. Alpine PG)"
                            className="p-2 border rounded-md text-sm"
                          />
                          <input
                            type="url"
                            value={school.url}
                            onChange={(e) => updateSchool(idx, 'url', e.target.value)}
                            placeholder="https://..."
                            className="p-2 border rounded-md text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSchool(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newSchoolName}
                      onChange={(e) => setNewSchoolName(e.target.value)}
                      placeholder="School name"
                      className="flex-1 p-2 border rounded-md text-sm"
                    />
                    <input
                      type="url"
                      value={newSchoolUrl}
                      onChange={(e) => setNewSchoolUrl(e.target.value)}
                      placeholder="https://website.com"
                      className="flex-1 p-2 border rounded-md text-sm"
                    />
                    <Button
                      type="button"
                      onClick={addSchool}
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>

                  {schools.length === 0 && (
                    <p className="text-sm text-muted-foreground italic text-center py-2">No schools added yet. Add schools above to enable the Paragliding Schools card.</p>
                  )}

                  {schools.length > 0 && (
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3">
                      <p className="text-xs text-purple-700 font-medium mb-2">Preview (buttons will shuffle on each page load):</p>
                      <div className="flex flex-wrap gap-2">
                        {schools.map((school, i) => (
                          <span key={i} className="inline-block px-3 py-1.5 bg-card text-purple-700 rounded-full text-xs font-semibold border border-purple-200">
                            {school.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>}
              </div>

              <div className="border rounded-lg bg-sky-50/30">
                <button type="button" onClick={() => toggleSection("telegram")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-sky" /> Telegram Groups
                  </h4>
                  {expandedSections.has("telegram") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("telegram") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Manage the Telegram group links displayed on the Community card.</p>
                  <div className="space-y-2">
                    {telegramGroups.map((group, idx) => (
                      <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                        <div className="flex-1 grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={group.name}
                            onChange={(e) => updateTelegramGroup(idx, 'name', e.target.value)}
                            placeholder="Group name (e.g. PG2 Group)"
                            className="p-2 border rounded-md text-sm"
                          />
                          <input
                            type="url"
                            value={group.url}
                            onChange={(e) => updateTelegramGroup(idx, 'url', e.target.value)}
                            placeholder="https://t.me/..."
                            className="p-2 border rounded-md text-sm"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeTelegramGroup(idx)}
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTelegramName}
                      onChange={(e) => setNewTelegramName(e.target.value)}
                      placeholder="Group name"
                      className="flex-1 p-2 border rounded-md text-sm"
                    />
                    <input
                      type="url"
                      value={newTelegramUrl}
                      onChange={(e) => setNewTelegramUrl(e.target.value)}
                      placeholder="https://t.me/+abc123"
                      className="flex-1 p-2 border rounded-md text-sm"
                    />
                    <Button
                      type="button"
                      onClick={addTelegramGroup}
                      className="bg-sky hover:bg-sky-light text-white"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>

                  {telegramGroups.length === 0 && (
                    <p className="text-sm text-muted-foreground italic text-center py-2">No Telegram groups added yet. Add groups above to show them on the Community card.</p>
                  )}

                  {telegramGroups.length > 0 && (
                    <div className="bg-sky/5 border border-sky/20 rounded-lg p-3">
                      <p className="text-xs text-navy font-medium mb-2">Preview:</p>
                      <div className="flex flex-col gap-2 items-center">
                        {telegramGroups.map((group, i) => (
                          <span key={i} className="inline-block px-3 py-1.5 bg-card text-navy rounded-full text-xs font-semibold border border-navy/20">
                            {group.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>}
              </div>

              <div className="border rounded-lg bg-amber-50/30">
                <button type="button" onClick={() => toggleSection("widgettags")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <Tags className="w-4 h-4 text-amber-600" /> Custom Widget Tags
                  </h4>
                  {expandedSections.has("widgettags") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("widgettags") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Create custom tags for filtered subsets of Telegram groups or Schools.</p>
                  {telegramGroups.length === 0 && schools.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic text-center py-2">Add Telegram groups or Schools above first, then you can create custom filtered tags from them.</p>
                  ) : (
                    <>
                      <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-3">
                        <p className="text-sm font-medium text-amber-800">Create New Tag</p>
                        <div className="flex gap-2">
                          <div className="flex items-center gap-1 bg-card border border-border rounded-md px-2 text-sm text-muted-foreground">
                            <span>{"{{"}</span>
                          </div>
                          <input
                            type="text"
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                            placeholder="tag_name"
                            className="flex-1 p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                          />
                          <div className="flex items-center gap-1 bg-card border border-border rounded-md px-2 text-sm text-muted-foreground">
                            <span>{"}}"}</span>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs text-foreground-secondary font-medium mb-1">Source type:</p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => { setNewTagSource("telegram"); setNewTagSelection([]); }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${newTagSource === "telegram" ? "bg-sky/10 border-sky text-sky" : "bg-card border-border text-muted-foreground hover:border-gray-400"}`}
                            >
                              <MessageCircle className="w-3.5 h-3.5" /> Telegram Groups
                            </button>
                            <button
                              type="button"
                              onClick={() => { setNewTagSource("school"); setNewTagSelection([]); }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${newTagSource === "school" ? "bg-purple-100 border-purple-400 text-purple-700" : "bg-card border-border text-muted-foreground hover:border-gray-400"}`}
                            >
                              <GraduationCap className="w-3.5 h-3.5" /> Schools
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-foreground-secondary font-medium">Select {newTagSource === "telegram" ? "groups" : "schools"} to include:</p>
                          {(newTagSource === "telegram" ? telegramGroups : schools).length === 0 ? (
                            <p className="text-xs text-foreground-faint italic py-1">No {newTagSource === "telegram" ? "Telegram groups" : "schools"} configured yet.</p>
                          ) : (
                            (newTagSource === "telegram" ? telegramGroups : schools).map((item, idx) => (
                              <label key={idx} className="flex items-center gap-2 p-1.5 rounded hover:bg-amber-100/50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={newTagSelection.includes(item.name)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setNewTagSelection(prev => [...prev, item.name]);
                                    } else {
                                      setNewTagSelection(prev => prev.filter(n => n !== item.name));
                                    }
                                  }}
                                  className="rounded border-border text-sky focus:ring-sky"
                                />
                                <span className="text-sm">{item.name}</span>
                              </label>
                            ))
                          )}
                        </div>
                        <Button type="button" onClick={addCustomTag} disabled={!newTagName.trim() || newTagSelection.length === 0} className="bg-amber-600 hover:bg-amber-700 text-white w-full">
                          <Plus className="w-4 h-4 mr-1" /> Create Tag
                        </Button>
                      </div>

                      {customWidgetTags.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-foreground-label">Your Custom Tags:</p>
                          {customWidgetTags.map((tag, idx) => (
                            <div key={idx} className="border border-border-subtle rounded-lg p-3 bg-card">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <code className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded text-sm font-mono border border-amber-200">{`{{${tag.name}}}`}</code>
                                  <span className={`inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded ${tag.source === "school" ? "bg-purple-50 text-purple-600 border border-purple-200" : "bg-sky/10 text-sky border border-sky/20"}`}>
                                    {tag.source === "school" ? <><GraduationCap className="w-3 h-3" /> Schools</> : <><MessageCircle className="w-3 h-3" /> Telegram</>}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => { navigator.clipboard.writeText(`{{${tag.name}}}`); }}
                                    className="text-foreground-faint hover:text-foreground-secondary p-1"
                                    title="Copy tag"
                                  >
                                    <Copy className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                                <div className="flex items-center gap-1">
                                  <button type="button" onClick={() => toggleEditTag(idx)} className="text-sky hover:text-sky-dark text-xs px-2 py-1 border border-sky/30 rounded hover:bg-sky/5">
                                    {editingTagIdx === idx ? "Cancel" : "Edit"}
                                  </button>
                                  <button type="button" onClick={() => deleteCustomTag(idx)} className="text-red-500 hover:text-red-700 p-1">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                              {editingTagIdx === idx ? (
                                <div className="space-y-2 border-t pt-2 mt-1">
                                  {(tag.source === "school" ? schools : telegramGroups).map((item, gIdx) => (
                                    <label key={gIdx} className="flex items-center gap-2 p-1 rounded hover:bg-background cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={editTagSelection.includes(item.name)}
                                        onChange={(e) => {
                                          if (e.target.checked) {
                                            setEditTagSelection(prev => [...prev, item.name]);
                                          } else {
                                            setEditTagSelection(prev => prev.filter(n => n !== item.name));
                                          }
                                        }}
                                        className="rounded border-border text-sky focus:ring-sky"
                                      />
                                      <span className="text-sm">{item.name}</span>
                                    </label>
                                  ))}
                                  <Button type="button" onClick={() => saveEditTag(idx)} disabled={editTagSelection.length === 0} className="bg-sky hover:bg-sky-light text-white text-xs w-full" size="sm"
                                  >
                                    <Check className="w-3.5 h-3.5 mr-1" /> Save Changes
                                  </Button>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {tag.items.map((name: string, i: number) => (
                                    <span key={i} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tag.source === "school" ? "bg-purple-50 text-purple-700 border border-purple-200" : "bg-sky/5 text-navy border border-navy/10"}`}>
                                      {name}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>}
              </div>

            </CardContent>}
          </Card>

          {/* Featured Site Section */}
          <Card className="border-t-4 border-t-navy overflow-hidden">
            <button type="button" onClick={() => toggleSection("featured")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Featured Site</CardTitle>
                    <CardDescription className="mt-1">Select a flying site to highlight in the dedicated section on the home page.</CardDescription>
                  </div>
                  {expandedSections.has("featured") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("featured") && <CardContent className="border-t border-border pt-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground-label">Select Site</label>
                <select 
                  name="featuredSiteId" 
                  value={formData.featuredSiteId} 
                  onChange={handleChange}
                  className="w-full p-2 border rounded-md focus:ring-navy focus:border-navy"
                >
                  <option value="">None</option>
                  {sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))}
                </select>
              </div>
            </CardContent>}
          </Card>

          <Card className="border-t-4 border-t-pink-500 overflow-hidden">
            <button type="button" onClick={() => toggleSection("socialmedia")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Share2 className="w-5 h-5 text-pink-500" /> Social Media
                    </CardTitle>
                    <CardDescription className="mt-1">Manage social links, YouTube videos, and Instagram embeds.</CardDescription>
                  </div>
                  {expandedSections.has("socialmedia") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("socialmedia") && <CardContent className="space-y-4 border-t border-border pt-4">

              <SocialMediaSubSection toggleSection={toggleSection} expandedSections={expandedSections} />

              <div className="border rounded-lg bg-red-50/30">
                <button type="button" onClick={() => toggleSection("youtube")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <Play className="w-4 h-4 text-red-500" /> YouTube Videos
                  </h4>
                  {expandedSections.has("youtube") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("youtube") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Manage YouTube video links for the YouTube Carousel on the home page.</p>
                  <div className="space-y-2">
                    {youtubeVideos.map((video, idx) => {
                      const videoId = extractYoutubeVideoId(video.url);
                      return (
                        <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                          {videoId && (
                            <img
                              src={`https://img.youtube.com/vi/${videoId}/default.jpg`}
                              alt=""
                              className="w-16 h-12 object-cover rounded"
                            />
                          )}
                          <div className="flex-1 text-sm text-muted-foreground truncate">{video.url}</div>
                          <div className="flex items-center gap-1">
                            <button type="button" onClick={() => moveYoutubeVideo(idx, 'up')} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                              <ArrowUp className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => moveYoutubeVideo(idx, 'down')} disabled={idx === youtubeVideos.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                              <ArrowDown className="w-4 h-4" />
                            </button>
                            <button type="button" onClick={() => removeYoutubeVideo(idx)} className="text-red-500 hover:text-red-700 p-1">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={newYoutubeUrl}
                      onChange={(e) => { setNewYoutubeUrl(e.target.value); setYoutubeUrlError(""); }}
                      placeholder="https://youtu.be/... or https://youtube.com/watch?v=..."
                      className="flex-1 p-2 border rounded-md text-sm"
                    />
                    <Button type="button" onClick={addYoutubeVideo} className="bg-red-500 hover:bg-red-600 text-white">
                      <Plus className="w-4 h-4 mr-1" /> Add
                    </Button>
                  </div>
                  {youtubeUrlError && (
                    <p className="text-sm text-red-500">{youtubeUrlError}</p>
                  )}

                  <div className="border border-border rounded-lg p-4 space-y-3 bg-muted/30">
                    <p className="text-sm font-medium text-foreground">Scrape YouTube Channel</p>
                    <p className="text-xs text-muted-foreground">Fetch the latest videos from a YouTube channel and add any new ones (max 40 total).</p>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={ytChannelUrl}
                        onChange={(e) => setYtChannelUrl(e.target.value)}
                        placeholder="https://www.youtube.com/@channelname"
                        className="flex-1 p-2 border border-border rounded-md text-sm focus:ring-1 focus:ring-sky focus:border-sky"
                      />
                      <Button
                        type="button"
                        disabled={ytScraping || !ytChannelUrl.trim()}
                        onClick={scrapeYoutubeChannel}
                        className="bg-red-500 hover:bg-red-600 text-white"
                      >
                        {ytScraping ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                        Scrape
                      </Button>
                    </div>
                    {ytScrapeResult && (
                      <p className="text-sm text-green-600">Successfully scraped {ytScrapeResult.count} videos.</p>
                    )}
                  </div>

                  {youtubeVideos.length === 0 && (
                    <p className="text-sm text-muted-foreground italic text-center py-2">No YouTube videos added yet. Add videos above or scrape a channel.</p>
                  )}
                </div>}
              </div>

              <div className="border rounded-lg bg-pink-50/30">
                <button type="button" onClick={() => toggleSection("instagram")} className="w-full text-left px-4 py-3 flex items-center justify-between">
                  <h4 className="font-bold text-navy flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-pink-500" /> Instagram Embeds
                  </h4>
                  {expandedSections.has("instagram") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {expandedSections.has("instagram") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
                  <p className="text-xs text-muted-foreground pt-2">Manage Instagram embed codes for the Insta Wall page.</p>
              <div className="space-y-2">
                {instagramEmbeds.map((embed, idx) => {
                  const urlMatch = embed.embedCode.match(/https:\/\/www\.instagram\.com\/[^"'\s]+/);
                  const shortUrl = urlMatch ? urlMatch[0].replace("https://www.instagram.com", "") : "Embed code";
                  return (
                    <div key={idx} className="flex items-center gap-2 p-2 border rounded-lg bg-background">
                      <div className="w-8 h-8 rounded bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {idx + 1}
                      </div>
                      <div className="flex-1 text-sm text-muted-foreground truncate" title={embed.embedCode}>
                        {shortUrl}
                      </div>
                      <div className="text-xs text-muted-foreground shrink-0">
                        {embed.addedAt ? new Date(embed.addedAt).toLocaleDateString() : ""}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => moveInstagramEmbed(idx, 'up')} disabled={idx === 0} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => moveInstagramEmbed(idx, 'down')} disabled={idx === instagramEmbeds.length - 1} className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30">
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => removeInstagramEmbed(idx)} className="text-red-500 hover:text-red-700 p-1">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <textarea
                  value={newInstaEmbed}
                  onChange={(e) => { setNewInstaEmbed(e.target.value); setInstaEmbedError(""); }}
                  placeholder='Paste Instagram embed code here (e.g. <blockquote class="instagram-media" ...>...</blockquote>)'
                  className="w-full p-2 border rounded-md text-sm font-mono min-h-[100px] resize-y"
                />
                <div className="flex gap-2 items-start">
                  <Button type="button" onClick={addInstagramEmbed} className="bg-pink-500 hover:bg-pink-600 text-white">
                    <Plus className="w-4 h-4 mr-1" /> Add Embed
                  </Button>
                  <p className="text-xs text-muted-foreground flex-1">
                    Go to an Instagram post → click ··· → Embed → Copy embed code, then paste it above.
                  </p>
                </div>
              </div>
              {instaEmbedError && (
                <p className="text-sm text-red-500">{instaEmbedError}</p>
              )}

              {instagramEmbeds.length === 0 && (
                <p className="text-sm text-muted-foreground italic text-center py-2">No Instagram embeds added yet. Paste embed codes above to add them to the Insta Wall.</p>
              )}
                </div>}
              </div>

            </CardContent>}
          </Card>

          {/* Current Conditions Section */}
          <Card className="border-t-4 border-t-gray-400 overflow-hidden">
            <button type="button" onClick={() => toggleSection("conditions")} className="w-full text-left">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle>Current Conditions</CardTitle>
                    <CardDescription className="mt-1">Configure the weather cards shown at the bottom of the home page.</CardDescription>
                  </div>
                  {expandedSections.has("conditions") ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>
              </CardHeader>
            </button>
            {expandedSections.has("conditions") && <CardContent className="space-y-4 pt-0">
              <div>
                <label className="block text-sm font-medium mb-1">Number of weather cards to display</label>
                <p className="text-xs text-muted-foreground mb-2">Shows the nearest sites to the visitor's location (or first N sites if location is unavailable).</p>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={formData.homeWeatherCardCount}
                  onChange={e => setWeatherCardCount(e.target.value)}
                  className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
              </div>
            </CardContent>}
          </Card>

        </form>


        <div ref={saveMessageRef} className="flex justify-end gap-4 mt-6">
          <Button
            type="button"
            onClick={() => { const form = document.querySelector('form'); if (form) form.requestSubmit(); }}
            className={`px-8 transition-all duration-300 ${justSaved ? "bg-emerald-500 hover:bg-emerald-600 scale-105" : "bg-navy hover:bg-navy-light"} text-white`}
            disabled={loading}
          >
            {justSaved ? <><Check className="w-4 h-4 mr-2" /> Saved!</> : <><Save className="w-4 h-4 mr-2" /> Save All Settings</>}
          </Button>
        </div>
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={saveSettings} />
    </div>
  );
}


function SocialMediaSubSection({ toggleSection, expandedSections }: { toggleSection: (id: string) => void; expandedSections: Set<string> }) {
  const { settings, updateSettings, loading } = useSettings();
  const [socialForm, setSocialForm] = useState<Record<string, string>>({});
  const [socialLoaded, setSocialLoaded] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!loading && !socialLoaded) {
      const initial: Record<string, string> = {};
      socialLinks.forEach(s => {
        initial[s.key] = (settings[s.key as keyof typeof settings] as string) || "";
      });
      setSocialForm(initial);
      setSocialLoaded(true);
    }
  }, [loading, socialLoaded, settings]);

  const handleSave = async () => {
    setSaveMsg(null);
    try {
      await updateSettings(socialForm as any);
      setSaveMsg({ type: "success", text: "Social media links saved successfully!" });
    } catch {
      setSaveMsg({ type: "error", text: "Failed to save social media links." });
    }
  };

  return (
    <div className="border rounded-lg bg-blue-50/30">
      <button type="button" onClick={() => toggleSection("sociallinks")} className="w-full text-left px-4 py-3 flex items-center justify-between">
        <h4 className="font-bold text-navy flex items-center gap-2">
          <Share2 className="w-4 h-4 text-pink-500" /> Social Media Links
        </h4>
        {expandedSections.has("sociallinks") ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {expandedSections.has("sociallinks") && <div className="px-4 pb-4 space-y-4 border-t border-border/50">
        <p className="text-xs text-muted-foreground pt-2">Add URLs for your social media profiles. Only platforms with a URL will display as icons in the website footer.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {socialLinks.map(s => (
            <div key={s.key} className="space-y-1">
              <label className="text-sm font-medium text-foreground-label flex items-center gap-2">
                <span className="text-foreground-faint">{s.icon}</span>
                {s.label}
              </label>
              <input
                type="url"
                className="w-full p-2 border border-border rounded-md focus:ring-1 focus:ring-sky focus:border-sky text-sm"
                value={socialForm[s.key] || ""}
                onChange={(e) => setSocialForm(prev => ({ ...prev, [s.key]: e.target.value }))}
                placeholder={`https://${s.label.toLowerCase().replace(/[^a-z]/g, '')}.com/...`}
              />
            </div>
          ))}
        </div>

        {saveMsg && (
          <div className={`mt-4 p-3 rounded-lg text-sm ${saveMsg.type === "success" ? "bg-emerald-50 border border-emerald-200 text-emerald-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {saveMsg.text}
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} className="bg-navy hover:bg-navy-light text-white" disabled={loading}>
            <Save className="w-4 h-4 mr-2" /> Save Social Links
          </Button>
        </div>
      </div>}
    </div>
  );
}
