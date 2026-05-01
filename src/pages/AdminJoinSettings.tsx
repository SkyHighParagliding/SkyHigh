import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, UserPlus, Save, Loader2, CheckCircle2, AlertCircle, Plus, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminForm } from "@/hooks/useAdminForm";
import { UnsavedChangesModal } from "@/components/UnsavedChangesModal";
import { useSettings } from "@/contexts/SettingsContext";

interface TierData {
  name: string;
  price: string;
  description: string;
  features: string[];
}

interface FaqData {
  q: string;
  a: string;
}

export function AdminJoinSettings() {
  const { token } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { markDirty, markClean, blocker, saving, justSaved, save } = useAdminForm({ successMessage: "Join page settings saved" });

  const [heroTitle, setHeroTitle] = useState("");
  const [heroSubtitle, setHeroSubtitle] = useState("");
  const [tidyhqUrl, setTidyhqUrl] = useState("");
  const [tiers, setTiers] = useState<TierData[]>([]);
  const [faqs, setFaqs] = useState<FaqData[]>([]);
  const [tiersOpen, setTiersOpen] = useState(true);
  const [faqsOpen, setFaqsOpen] = useState(false);

  const [originalSnapshot, setOriginalSnapshot] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const ht = (settings.joinHeroTitle as string) || "";
    const hs = (settings.joinHeroSubtitle as string) || "";
    const tu = (settings.joinTidyhqUrl as string) || "";
    setHeroTitle(ht);
    setHeroSubtitle(hs);
    setTidyhqUrl(tu);

    let parsedTiers: TierData[] = [];
    try {
      const p = settings.joinTiers ? JSON.parse(settings.joinTiers as string) : [];
      parsedTiers = Array.isArray(p) && p.length > 0 ? p : [];
    } catch { parsedTiers = []; }
    setTiers(parsedTiers);

    let parsedFaqs: FaqData[] = [];
    try {
      const p = settings.joinFaqs ? JSON.parse(settings.joinFaqs as string) : [];
      parsedFaqs = Array.isArray(p) && p.length > 0 ? p : [];
    } catch { parsedFaqs = []; }
    setFaqs(parsedFaqs);

    setOriginalSnapshot(JSON.stringify({ ht, hs, tu, tiers: parsedTiers, faqs: parsedFaqs }));
  }, [settings.joinHeroTitle, settings.joinHeroSubtitle, settings.joinTidyhqUrl, settings.joinTiers, settings.joinFaqs]);

  const currentSnapshot = JSON.stringify({ ht: heroTitle, hs: heroSubtitle, tu: tidyhqUrl, tiers, faqs });
  const hasChanges = currentSnapshot !== originalSnapshot;

  useEffect(() => {
    if (hasChanges) {
      markDirty();
    } else {
      markClean();
    }
  }, [hasChanges, markDirty, markClean]);

  async function handleSave() {
    await save(async () => {
      await updateSettings({
        joinHeroTitle: heroTitle,
        joinHeroSubtitle: heroSubtitle,
        joinTidyhqUrl: tidyhqUrl,
        joinTiers: tiers.length > 0 ? JSON.stringify(tiers) : "",
        joinFaqs: faqs.length > 0 ? JSON.stringify(faqs) : "",
      });
      setOriginalSnapshot(currentSnapshot);
    });
  }

  const addTier = () => {
    setTiers([...tiers, { name: "", price: "", description: "", features: [""] }]);
  };

  const removeTier = (index: number) => {
    setTiers(tiers.filter((_, i) => i !== index));
  };

  const updateTierField = <K extends keyof TierData>(index: number, field: K, value: TierData[K]) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };
    setTiers(updated);
  };

  const addFeature = (tierIndex: number) => {
    const updated = [...tiers];
    updated[tierIndex] = { ...updated[tierIndex], features: [...updated[tierIndex].features, ""] };
    setTiers(updated);
  };

  const removeFeature = (tierIndex: number, featureIndex: number) => {
    const updated = [...tiers];
    updated[tierIndex] = { ...updated[tierIndex], features: updated[tierIndex].features.filter((_, i) => i !== featureIndex) };
    setTiers(updated);
  };

  const updateFeature = (tierIndex: number, featureIndex: number, value: string) => {
    const updated = [...tiers];
    const newFeatures = [...updated[tierIndex].features];
    newFeatures[featureIndex] = value;
    updated[tierIndex] = { ...updated[tierIndex], features: newFeatures };
    setTiers(updated);
  };

  const addFaq = () => {
    setFaqs([...faqs, { q: "", a: "" }]);
  };

  const removeFaq = (index: number) => {
    setFaqs(faqs.filter((_, i) => i !== index));
  };

  const updateFaq = (index: number, field: keyof FaqData, value: string) => {
    const updated = [...faqs];
    updated[index] = { ...updated[index], [field]: value };
    setFaqs(updated);
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-6">
          <Link to="/admin" className="text-sky hover:underline text-sm flex items-center gap-1 mb-4">
            <ArrowLeft className="w-4 h-4" /> Back to Dashboard
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold text-navy flex items-center gap-2">
                <UserPlus className="w-8 h-8" /> Join Page Settings
              </h1>
              <p className="text-foreground-secondary mt-1">Configure the membership signup page content, tiers, and FAQ.</p>
            </div>
            <Button onClick={handleSave} disabled={saving || !hasChanges} className="bg-navy hover:bg-navy/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>

        <div className="space-y-6">
          <Card className="border-t-4 border-t-sky">
            <CardHeader>
              <CardTitle className="text-navy">Hero Section</CardTitle>
              <p className="text-sm text-muted-foreground">Customise the title and subtitle displayed in the hero banner at the top of the Join page.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground-label block mb-1">Hero Title</label>
                <Input
                  type="text"
                  placeholder='Leave blank for default: "Join [Club Name]"'
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground-label block mb-1">Hero Subtitle</label>
                <textarea
                  className="w-full p-2.5 border border-border rounded-lg text-sm focus:ring-1 focus:ring-sky focus:border-sky bg-background"
                  rows={2}
                  placeholder="Become part of our flying community..."
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-blue-500">
            <CardHeader>
              <CardTitle className="text-navy">TidyHQ Membership URL</CardTitle>
              <p className="text-sm text-muted-foreground">The URL that CTA buttons link to for membership signup. This should be your club's TidyHQ membership page.</p>
            </CardHeader>
            <CardContent>
              <Input
                type="url"
                placeholder="https://yourclub.tidyhq.com/public/membership_levels"
                value={tidyhqUrl}
                onChange={(e) => setTidyhqUrl(e.target.value)}
              />
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-indigo-500">
            <CardHeader>
              <button onClick={() => setTiersOpen(!tiersOpen)} className="w-full flex items-center justify-between">
                <div className="text-left">
                  <CardTitle className="text-navy">Membership Tiers ({tiers.length || 'using defaults'})</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Define membership tiers with pricing and features. Leave empty to use default tiers.</p>
                </div>
                {tiersOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
            </CardHeader>
            {tiersOpen && (
              <CardContent className="space-y-4">
                {tiers.map((tier, ti) => (
                  <div key={ti} className="p-4 border border-border-faint rounded-xl space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground-faint uppercase">Tier {ti + 1}</span>
                      <button onClick={() => removeTier(ti)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-foreground-label mb-1">Name</label>
                        <Input
                          type="text"
                          placeholder="Full Membership"
                          value={tier.name}
                          onChange={(e) => updateTierField(ti, "name", e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-foreground-label mb-1">Price</label>
                        <Input
                          type="text"
                          placeholder="$120/year"
                          value={tier.price}
                          onChange={(e) => updateTierField(ti, "price", e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Description</label>
                      <textarea
                        className="w-full p-2 border border-border rounded-lg text-sm focus:ring-1 focus:ring-sky bg-background"
                        rows={2}
                        placeholder="Full flying privileges at all club sites..."
                        value={tier.description}
                        onChange={(e) => updateTierField(ti, "description", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Features</label>
                      {tier.features.map((f, fi) => (
                        <div key={fi} className="flex gap-2 mb-2">
                          <Input
                            type="text"
                            className="flex-1"
                            placeholder="Access to all flying sites"
                            value={f}
                            onChange={(e) => updateFeature(ti, fi, e.target.value)}
                          />
                          {tier.features.length > 1 && (
                            <button onClick={() => removeFeature(ti, fi)} className="text-red-400 hover:text-red-600 px-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={() => addFeature(ti)}
                        className="text-xs text-sky hover:text-sky-dark font-medium inline-flex items-center gap-1 mt-1"
                      >
                        <Plus className="w-3 h-3" /> Add Feature
                      </button>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTier} className="w-full">
                  <Plus className="w-4 h-4 mr-1" /> Add Tier
                </Button>
              </CardContent>
            )}
          </Card>

          <Card className="border-t-4 border-t-amber-500">
            <CardHeader>
              <button onClick={() => setFaqsOpen(!faqsOpen)} className="w-full flex items-center justify-between">
                <div className="text-left">
                  <CardTitle className="text-navy">FAQ Section ({faqs.length || 'using defaults'})</CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">Add questions and answers shown on the Join page. Leave empty to use default FAQs.</p>
                </div>
                {faqsOpen ? <ChevronUp className="w-5 h-5 text-gray-400" /> : <ChevronDown className="w-5 h-5 text-gray-400" />}
              </button>
            </CardHeader>
            {faqsOpen && (
              <CardContent className="space-y-4">
                {faqs.map((faq, fi) => (
                  <div key={fi} className="p-4 border border-border-faint rounded-xl space-y-3 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground-faint uppercase">FAQ {fi + 1}</span>
                      <button onClick={() => removeFaq(fi)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Question</label>
                      <Input
                        type="text"
                        placeholder="What do I get with my membership?"
                        value={faq.q}
                        onChange={(e) => updateFaq(fi, "q", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-foreground-label mb-1">Answer</label>
                      <textarea
                        className="w-full p-2 border border-border rounded-lg text-sm focus:ring-1 focus:ring-sky bg-background"
                        rows={3}
                        placeholder="Membership gives you access to..."
                        value={faq.a}
                        onChange={(e) => updateFaq(fi, "a", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addFaq} className="w-full">
                  <Plus className="w-4 h-4 mr-1" /> Add FAQ
                </Button>
              </CardContent>
            )}
          </Card>
          <div className="flex items-center justify-between pt-2">
            <Link to="/admin" className="text-sky hover:underline text-sm flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <Button onClick={handleSave} disabled={saving || !hasChanges} className="bg-navy hover:bg-navy/90 text-white">
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              Save All
            </Button>
          </div>
        </div>
      </div>
      <UnsavedChangesModal blocker={blocker} onSave={handleSave} />
    </div>
  );
}
