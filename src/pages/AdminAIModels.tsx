import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Plus, X, GripVertical, RotateCcw, FlaskConical, Check, AlertCircle, Loader2, ChevronUp, ChevronDown, Cpu, ImagePlus, ArrowLeftRight, Zap, Brain, DollarSign, Eye, Image, Sparkles, Clock, BookOpen, Save } from "lucide-react";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { api } from "@/lib/apiClient";

interface AvailableModel {
  name: string;
  displayName: string;
  description: string;
}

interface TestResult {
  success: boolean;
  elapsed: number;
  message?: string;
  error?: string;
}

interface ReplaceTarget {
  model: string;
  index: number;
  list: "text" | "image";
}

type TraitKey = "fast" | "thinking" | "cheap" | "vision" | "image-gen" | "large-ctx" | "legacy" | "experimental";

interface TraitDef {
  key: TraitKey;
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  description: string;
}

const TRAIT_DEFS: TraitDef[] = [
  { key: "fast", label: "Fast", shortLabel: "Fast", icon: <Zap className="w-3 h-3" />, color: "text-amber-600", bg: "bg-amber-50", description: "Optimised for speed — lower latency responses" },
  { key: "thinking", label: "Deep Thinking", shortLabel: "Think", icon: <Brain className="w-3 h-3" />, color: "text-violet-600", bg: "bg-violet-50", description: "Advanced reasoning and complex analysis" },
  { key: "cheap", label: "Low Cost", shortLabel: "Cheap", icon: <DollarSign className="w-3 h-3" />, color: "text-emerald-600", bg: "bg-emerald-50", description: "Lower token cost per request" },
  { key: "vision", label: "Vision", shortLabel: "Vision", icon: <Eye className="w-3 h-3" />, color: "text-blue-600", bg: "bg-blue-50", description: "Can analyse images and visual input" },
  { key: "image-gen", label: "Image Generation", shortLabel: "ImgGen", icon: <Image className="w-3 h-3" />, color: "text-pink-600", bg: "bg-pink-50", description: "Can generate and edit images" },
  { key: "large-ctx", label: "Large Context", shortLabel: "LgCtx", icon: <BookOpen className="w-3 h-3" />, color: "text-sky", bg: "bg-sky/5", description: "1M+ token context window" },
  { key: "legacy", label: "Legacy", shortLabel: "Old", icon: <Clock className="w-3 h-3" />, color: "text-muted-foreground", bg: "bg-muted", description: "Older model — may be deprecated soon" },
  { key: "experimental", label: "Experimental", shortLabel: "Exp", icon: <Sparkles className="w-3 h-3" />, color: "text-orange", bg: "bg-orange/10", description: "Preview/experimental — may change without notice" },
];

function getModelTraits(name: string): TraitKey[] {
  const n = name.toLowerCase();
  const traits: TraitKey[] = [];

  if (n.includes("flash") && !n.includes("pro")) traits.push("fast");
  if (n.includes("lite")) { traits.push("fast"); if (!traits.includes("cheap")) traits.push("cheap"); }

  if (n.includes("pro") && !n.includes("flash")) traits.push("thinking");
  if (n.includes("2.5-pro") || n.includes("2.5-flash")) {
    if (!traits.includes("thinking") && n.includes("pro")) traits.push("thinking");
  }

  if (n.includes("flash") && !n.includes("pro")) traits.push("cheap");

  if (n.includes("1.5-") || n.includes("1.0-")) traits.push("legacy");

  if (n.includes("preview") || n.includes("exp") || n.includes("latest")) traits.push("experimental");

  if (n.includes("image") || n.includes("imagen")) traits.push("image-gen");

  const hasVision = (n.includes("pro") || n.includes("flash")) && !n.includes("1.0-") && !n.includes("image") && !n.includes("embedding") && !n.includes("aqa");
  if (hasVision) traits.push("vision");

  if ((n.includes("1.5-") || n.includes("2.0-") || n.includes("2.5-")) && (n.includes("pro") || n.includes("flash")) && !n.includes("lite") && !n.includes("image")) {
    traits.push("large-ctx");
  }

  const unique = [...new Set(traits)];
  return unique;
}

function TraitBadges({ modelName, compact }: { modelName: string; compact?: boolean }) {
  const traits = getModelTraits(modelName);
  if (traits.length === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 ml-1.5">
      {traits.map(key => {
        const def = TRAIT_DEFS.find(d => d.key === key)!;
        return (
          <span
            key={key}
            title={`${def.label}: ${def.description}`}
            className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold ${def.color} ${def.bg} ${compact ? "" : "leading-none"}`}
          >
            {def.icon}
            {!compact && <span className="hidden sm:inline">{def.shortLabel}</span>}
          </span>
        );
      })}
    </span>
  );
}

export function AdminAIModels() {
  const [textModels, setTextModels] = useState<string[]>([]);
  const [imageModels, setImageModels] = useState<string[]>([]);
  const [defaultTextModels, setDefaultTextModels] = useState<string[]>([]);
  const [defaultImageModels, setDefaultImageModels] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTraitFilters, setActiveTraitFilters] = useState<TraitKey[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchDone, setSearchDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [replacing, setReplacing] = useState<ReplaceTarget | null>(null);
  const { isDirty: dirty, markDirty, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "AI model config saved" });

  const searchSectionRef = useRef<HTMLDivElement>(null);
  const token = localStorage.getItem("adminToken");

  const loadConfig = useCallback(async () => {
    try {
      const data = await api.get<Record<string, string[]>>("/api/ai/models/config", token);
      setTextModels(data.textModels);
      setImageModels(data.imageModels);
      setDefaultTextModels(data.defaultTextModels);
      setDefaultImageModels(data.defaultImageModels);
    } catch {} finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  const searchModels = async () => {
    setSearching(true);
    try {
      const data = await api.get<{ models: AvailableModel[] }>("/api/ai/models", token);
      setAvailableModels(data.models);
      setSearchDone(true);
    } catch {} finally {
      setSearching(false);
    }
  };

  const saveConfig = () => save(async () => {
    const data = await api.put<Record<string, string[]>>("/api/ai/models/config", { textModels, imageModels }, token);
    setTextModels(data.textModels);
    setImageModels(data.imageModels);
  });

  const testModel = async (model: string, type: "text" | "image") => {
    setTestingModel(model);
    try {
      const result = await api.post<TestResult>("/api/ai/models/test", { model, type }, token);
      setTestResults(prev => ({ ...prev, [model]: result }));
    } catch (e: unknown) {
      setTestResults(prev => ({ ...prev, [model]: { success: false, elapsed: 0, error: e instanceof Error ? e.message : "Failed" } }));
    } finally {
      setTestingModel(null);
    }
  };

  const addModel = (model: string, list: "text" | "image") => {
    if (list === "text") {
      if (!textModels.includes(model)) {
        setTextModels(prev => [...prev, model]);
        markDirty();
      }
    } else {
      if (!imageModels.includes(model)) {
        setImageModels(prev => [...prev, model]);
        markDirty();
      }
    }
  };

  const replaceModel = (newModel: string) => {
    if (!replacing) return;
    const { index, list } = replacing;
    const setter = list === "text" ? setTextModels : setImageModels;
    setter(prev => {
      const arr = [...prev];
      arr[index] = newModel;
      return arr;
    });
    markDirty();
    setReplacing(null);
  };

  const startReplace = async (model: string, index: number, list: "text" | "image") => {
    setReplacing({ model, index, list });
    if (!searchDone) {
      await searchModels();
    }
    setTimeout(() => {
      searchSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const removeModel = (model: string, list: "text" | "image") => {
    if (list === "text") {
      if (textModels.length > 1) {
        setTextModels(prev => prev.filter(m => m !== model));
        markDirty();
      }
    } else {
      if (imageModels.length > 1) {
        setImageModels(prev => prev.filter(m => m !== model));
        markDirty();
      }
    }
  };

  const moveModel = (index: number, direction: "up" | "down", list: "text" | "image") => {
    const setter = list === "text" ? setTextModels : setImageModels;
    setter(prev => {
      const arr = [...prev];
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= arr.length) return arr;
      [arr[index], arr[newIndex]] = [arr[newIndex], arr[index]];
      return arr;
    });
    markDirty();
  };

  const resetToDefaults = (list: "text" | "image") => {
    if (list === "text") {
      setTextModels([...defaultTextModels]);
    } else {
      setImageModels([...defaultImageModels]);
    }
    markDirty();
  };

  const toggleTraitFilter = (key: TraitKey) => {
    setActiveTraitFilters(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const currentChainModels = replacing?.list === "text" ? textModels : replacing?.list === "image" ? imageModels : [];

  const filteredModels = (() => {
    let models = availableModels.filter(m => {
      if (replacing && currentChainModels.includes(m.name)) return false;
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return m.name.toLowerCase().includes(q) || m.displayName.toLowerCase().includes(q) || (m.description || "").toLowerCase().includes(q);
    });

    if (activeTraitFilters.length > 0) {
      models = [...models].sort((a, b) => {
        const aTraits = getModelTraits(a.name);
        const bTraits = getModelTraits(b.name);
        const aScore = activeTraitFilters.filter(f => aTraits.includes(f)).length;
        const bScore = activeTraitFilters.filter(f => bTraits.includes(f)).length;
        return bScore - aScore;
      });
    }

    return models;
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-sky" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="text-foreground-faint hover:text-navy transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-navy">AI Model Configuration</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={saveConfig}
            disabled={!dirty || saving}
            className={`px-6 py-2 rounded-lg text-sm font-medium transition-all duration-300 ${
              justSaved
                ? "bg-emerald-500 hover:bg-emerald-600 text-white scale-105"
                : dirty
                  ? "bg-navy hover:bg-navy-light text-white"
                  : "bg-muted text-foreground-faint cursor-not-allowed"
            }`}
          >
            {justSaved ? <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Saved!</span> : <span className="flex items-center gap-1"><Save className="w-4 h-4" /> Save Changes</span>}
          </button>
        </div>
      </div>

      <p className="text-muted-foreground text-sm mb-4">
        Configure which AI models are used for text generation and image processing. Models are tried in order — if the first fails, the next one is used automatically. Search Google's available models to find replacements when models are deprecated.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <ModelChainPanel
          title="Text Models"
          icon={<Cpu className="w-5 h-5" />}
          models={textModels}
          type="text"
          onRemove={(m) => removeModel(m, "text")}
          onMove={(i, d) => moveModel(i, d, "text")}
          onReset={() => resetToDefaults("text")}
          onTest={(m) => testModel(m, "text")}
          onReplace={(m, i) => startReplace(m, i, "text")}
          testingModel={testingModel}
          testResults={testResults}
          canRemove={textModels.length > 1}
          replacingModel={replacing?.list === "text" ? replacing.model : null}
        />
        <ModelChainPanel
          title="Image Models"
          icon={<ImagePlus className="w-5 h-5" />}
          models={imageModels}
          type="image"
          onRemove={(m) => removeModel(m, "image")}
          onMove={(i, d) => moveModel(i, d, "image")}
          onReset={() => resetToDefaults("image")}
          onTest={(m) => testModel(m, "image")}
          onReplace={(m, i) => startReplace(m, i, "image")}
          testingModel={testingModel}
          testResults={testResults}
          canRemove={imageModels.length > 1}
          replacingModel={replacing?.list === "image" ? replacing.model : null}
        />
      </div>

      <div ref={searchSectionRef} className={`border rounded-xl bg-card transition-colors ${replacing ? "border-sky ring-2 ring-sky/20" : "border-border-subtle"}`}>
        <div className="p-4 border-b border-border-faint flex items-center justify-between">
          <div>
            {replacing ? (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="font-bold text-navy">Replace: <span className="font-mono text-sky">{replacing.model}</span></h2>
                  <button
                    onClick={() => setReplacing(null)}
                    className="text-xs text-foreground-faint hover:text-red-500 transition-colors flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Cancel
                  </button>
                </div>
                <p className="text-xs text-foreground-faint mt-0.5">
                  Select a model below to replace <span className="font-mono">{replacing.model}</span> at position {replacing.index + 1} in the {replacing.list} chain
                </p>
              </>
            ) : (
              <>
                <h2 className="font-bold text-navy">Available Models from Google</h2>
                <p className="text-xs text-foreground-faint mt-0.5">Search the Gemini API for all currently available models</p>
              </>
            )}
          </div>
          {!replacing && (
            <button
              onClick={searchModels}
              disabled={searching}
              className="flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-lg text-sm font-medium hover:bg-navy-light transition-colors disabled:opacity-50"
            >
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searching ? "Fetching..." : searchDone ? "Refresh List" : "Fetch Available Models"}
            </button>
          )}
        </div>

        {searchDone && (
          <>
            <div className="p-4 border-b border-border-faint">
              <div className="flex items-center gap-1.5 flex-wrap">
                {TRAIT_DEFS.map(def => {
                  const active = activeTraitFilters.includes(def.key);
                  return (
                    <button
                      key={def.key}
                      onClick={() => toggleTraitFilter(def.key)}
                      title={`${def.label}: ${def.description}`}
                      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        active
                          ? `${def.bg} ${def.color} ring-1 ring-current shadow-sm`
                          : "bg-background text-foreground-faint hover:bg-muted hover:text-foreground-secondary"
                      }`}
                    >
                      {def.icon}
                      <span>{def.label}</span>
                    </button>
                  );
                })}
                {activeTraitFilters.length > 0 && (
                  <button
                    onClick={() => setActiveTraitFilters([])}
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-foreground-faint hover:text-red-500 transition-colors"
                    title="Clear all filters"
                  >
                    <X className="w-3 h-3" /> Clear
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2">
                <div className="relative flex-shrink-0">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-foreground-ghost" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Name..."
                    className="w-36 pl-7 pr-2 py-1 border border-border-subtle rounded-md text-xs focus:ring-1 focus:ring-sky focus:border-sky"
                  />
                </div>
                <p className="text-xs text-foreground-faint flex-1">
                  {activeTraitFilters.length > 0
                    ? <><span className="font-medium text-muted-foreground">Sorted by:</span> {activeTraitFilters.map(f => TRAIT_DEFS.find(d => d.key === f)!.label).join(" + ")}</>
                    : "Click traits to sort by what matters most"}
                  {replacing ? " (chain models hidden)" : ""}
                  <span className="text-foreground-ghost mx-1">|</span>{filteredModels.length}/{availableModels.length}
                </p>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
              {filteredModels.map((m) => {
                const inText = textModels.includes(m.name);
                const inImage = imageModels.includes(m.name);
                const result = testResults[m.name];
                const isTesting = testingModel === m.name;
                const modelTraits = getModelTraits(m.name);
                const matchCount = activeTraitFilters.length > 0 ? activeTraitFilters.filter(f => modelTraits.includes(f)).length : 0;
                const isFullMatch = matchCount > 0 && matchCount === activeTraitFilters.length;

                return (
                  <div key={m.name} className={`px-4 py-3 flex items-center gap-3 transition-colors ${replacing ? "hover:bg-sky/5 cursor-pointer" : "hover:bg-background"} ${isFullMatch ? "bg-emerald-50/50" : matchCount > 0 ? "bg-amber-50/30" : ""}`}
                    onClick={replacing ? () => replaceModel(m.name) : undefined}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {matchCount > 0 && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isFullMatch ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                            {matchCount}/{activeTraitFilters.length}
                          </span>
                        )}
                        <span className="font-mono text-sm text-navy font-medium">{m.name}</span>
                        <TraitBadges modelName={m.name} />
                        {!replacing && inText && <span className="text-[10px] px-1.5 py-0.5 bg-sky/10 text-sky rounded font-bold">TEXT</span>}
                        {!replacing && inImage && <span className="text-[10px] px-1.5 py-0.5 bg-orange/10 text-orange rounded font-bold">IMAGE</span>}
                      </div>
                      <p className="text-xs text-foreground-faint truncate">{m.displayName}{m.description ? ` — ${m.description}` : ""}</p>
                      {result && (
                        <p className={`text-xs mt-0.5 ${result.success ? "text-emerald-600" : "text-red-500"}`}>
                          {result.success ? `${result.message} (${result.elapsed}ms)` : result.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {replacing ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); replaceModel(m.name); }}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-bold text-white bg-sky hover:bg-sky-light transition-colors"
                        >
                          <ArrowLeftRight className="w-3 h-3" /> Use This
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => testModel(m.name, m.name.includes("image") ? "image" : "text")}
                            disabled={isTesting}
                            className="p-1.5 rounded-md text-foreground-faint hover:text-sky hover:bg-sky/10 transition-colors disabled:opacity-50"
                            title="Test model"
                          >
                            {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                          </button>
                          {!inText && (
                            <button
                              onClick={() => addModel(m.name, "text")}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-sky hover:bg-sky/10 transition-colors"
                              title="Add to text chain"
                            >
                              <Plus className="w-3 h-3" /> Text
                            </button>
                          )}
                          {!inImage && (
                            <button
                              onClick={() => addModel(m.name, "image")}
                              className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-orange hover:bg-orange/10 transition-colors"
                              title="Add to image chain"
                            >
                              <Plus className="w-3 h-3" /> Image
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!searchDone && !searching && (
          <div className="p-8 text-center text-foreground-faint text-sm">
            {replacing
              ? "Fetching available models..."
              : 'Click "Fetch Available Models" to query Google for all currently available Gemini models.'}
          </div>
        )}

        {searching && (
          <div className="p-8 flex items-center justify-center gap-2 text-foreground-faint text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Fetching models from Google...
          </div>
        )}
      </div>

      <div className="flex justify-end mt-6">
        <button
          onClick={saveConfig}
          disabled={!dirty || saving}
          className={`px-8 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 ${
            justSaved
              ? "bg-emerald-500 hover:bg-emerald-600 text-white scale-105"
              : dirty
                ? "bg-navy hover:bg-navy-light text-white"
                : "bg-muted text-foreground-faint cursor-not-allowed"
          }`}
        >
          {justSaved ? <span className="flex items-center gap-1"><Check className="w-4 h-4" /> Saved!</span> : <span className="flex items-center gap-1"><Save className="w-4 h-4" /> Save Changes</span>}
        </button>
      </div>

      <UnsavedChangesModal blocker={blocker} onSave={saveConfig} />
    </div>
  );
}

function ModelChainPanel({
  title, icon, models, type, onRemove, onMove, onReset, onTest, onReplace, testingModel, testResults, canRemove, replacingModel
}: {
  title: string;
  icon: React.ReactNode;
  models: string[];
  type: "text" | "image";
  onRemove: (m: string) => void;
  onMove: (i: number, d: "up" | "down") => void;
  onReset: () => void;
  onTest: (m: string) => void;
  onReplace: (m: string, i: number) => void;
  testingModel: string | null;
  testResults: Record<string, TestResult>;
  canRemove: boolean;
  replacingModel: string | null;
}) {
  return (
    <div className="border border-border-subtle rounded-xl bg-card">
      <div className="p-4 border-b border-border-faint flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${type === "text" ? "bg-sky/10 text-sky" : "bg-orange/10 text-orange"}`}>
            {icon}
          </div>
          <div>
            <h3 className="font-bold text-navy text-sm">{title}</h3>
            <p className="text-[11px] text-foreground-faint">Fallback chain — tried in order</p>
          </div>
        </div>
        <button
          onClick={onReset}
          className="flex items-center gap-1 text-xs text-foreground-faint hover:text-navy transition-colors"
          title="Reset to defaults"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>
      </div>

      <div className="divide-y divide-gray-50">
        {models.map((model, idx) => {
          const result = testResults[model];
          const isTesting = testingModel === model;
          const isBeingReplaced = replacingModel === model;

          return (
            <div key={model} className={`px-4 py-3 flex items-center gap-2 group transition-colors ${isBeingReplaced ? "bg-sky/5 ring-1 ring-inset ring-sky/30" : ""}`}>
              <GripVertical className="w-4 h-4 text-foreground-ghost flex-shrink-0" />
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                idx === 0
                  ? (type === "text" ? "bg-sky text-white" : "bg-orange text-white")
                  : "bg-muted text-foreground-faint"
              }`}>
                {idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="font-mono text-sm text-navy">{model}</span>
                  <TraitBadges modelName={model} compact />
                </div>
                {isBeingReplaced && <p className="text-xs text-sky font-medium animate-pulse mt-0.5">selecting replacement...</p>}
                {result && !isBeingReplaced && (
                  <p className={`text-xs mt-0.5 ${result.success ? "text-emerald-600" : "text-red-500"}`}>
                    {result.success ? (
                      <><Check className="w-3 h-3 inline" /> {result.elapsed}ms</>
                    ) : (
                      <><AlertCircle className="w-3 h-3 inline" /> Failed</>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => onReplace(model, idx)}
                  className={`p-1 rounded transition-colors ${type === "text" ? "text-sky hover:bg-sky/10" : "text-orange hover:bg-orange/10"}`}
                  title="Replace with another model"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onMove(idx, "up")}
                  disabled={idx === 0}
                  className="p-1 rounded text-foreground-faint hover:text-navy disabled:opacity-30"
                  title="Move up"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onMove(idx, "down")}
                  disabled={idx === models.length - 1}
                  className="p-1 rounded text-foreground-faint hover:text-navy disabled:opacity-30"
                  title="Move down"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onTest(model)}
                  disabled={isTesting}
                  className="p-1 rounded text-foreground-faint hover:text-sky disabled:opacity-50"
                  title="Test model"
                >
                  {isTesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => onRemove(model)}
                  disabled={!canRemove}
                  className="p-1 rounded text-foreground-faint hover:text-red-500 disabled:opacity-30"
                  title="Remove"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
