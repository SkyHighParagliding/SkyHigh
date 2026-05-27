import { useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldCheck, AlertTriangle, CheckCircle2, MapPin, Info } from "lucide-react";
import { useSettings } from "@/contexts/SettingsContext";
import { useSites, useCreateCheckin } from "@/hooks/api";

interface CheckinResult {
  id: string;
  timestamp: string;
  [key: string]: unknown;
}

export function CheckIn() {
  const [searchParams] = useSearchParams();
  const initialSite = searchParams.get("site") || "";
  const navigate = useNavigate();
  const { settings, loading: settingsLoading } = useSettings();

  const [step, setStep] = useState(1);
  const [selectedSite, setSelectedSite] = useState(initialSite);
  const [agreedToRules, setAgreedToRules] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: sites = [], isLoading: loading } = useSites();
  const checkinMutation = useCreateCheckin();
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null);

  const handleCheckIn = async () => {
    setIsSubmitting(true);
    try {
      const data = await checkinMutation.mutateAsync({ siteId: selectedSite });
      if (data.success) {
        setCheckinResult(data.checkin as CheckinResult);
        setStep(3);
      } else {
        alert("Failed to check in: " + (data.error || "Unknown error"));
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred while checking in.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (settingsLoading) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (!settings.onlineCheckInEnabled) {
    return (
      <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-start">
        <div className="w-full max-w-2xl mt-8">
          <Card className="shadow-lg border-t-4 border-t-sky text-center py-12">
            <CardContent>
              <Info className="w-16 h-16 text-sky mx-auto mb-6" />
              <h2 className="text-3xl font-bold text-navy mb-4">Online Check-in is Currently Disabled</h2>
              <p className="text-foreground-secondary mb-8 max-w-md mx-auto">
                The mandatory online check-in system is currently turned off. You do not need to check in online before flying at this time. Please ensure you still follow all site rules and safety guidelines.
              </p>
              <div className="flex justify-center gap-4">
                <Link to="/sites">
                  <Button variant="outline">Explore Sites</Button>
                </Link>
                <Link to="/safety">
                  <Button variant="orange">Safety Guidelines</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-start">
      <div className="w-full max-w-2xl mt-8">
        
        <div className="text-center mb-8">
          <ShieldCheck className="w-16 h-16 text-navy mx-auto mb-4" />
          <h1 className="text-3xl font-extrabold text-navy">Pilot Check-in</h1>
          <p className="text-foreground-secondary mt-2">Mandatory safety check-in before flying.</p>
        </div>

        {/* Progress Bar */}
        <div className="flex items-center justify-center mb-8">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-navy text-white' : 'bg-gray-200 text-muted-foreground'}`}>1</div>
          <div className={`h-1 w-16 ${step >= 2 ? 'bg-navy' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-navy text-white' : 'bg-gray-200 text-muted-foreground'}`}>2</div>
          <div className={`h-1 w-16 ${step >= 3 ? 'bg-navy' : 'bg-gray-200'}`}></div>
          <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-muted-foreground'}`}>3</div>
        </div>

        {step === 1 && (
          <Card className="shadow-lg border-t-4 border-t-sky">
            <CardHeader>
              <CardTitle>Select Location</CardTitle>
              <CardDescription>Where are you planning to fly today?</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-4 text-muted-foreground">Loading sites...</div>
              ) : (
                <div className="space-y-4">
                  {sites.map((site) => (
                    <label 
                      key={site.id} 
                      className={`flex items-center p-4 border rounded-lg cursor-pointer transition-colors ${selectedSite === site.id ? 'border-sky bg-sky/5 ring-1 ring-sky' : 'hover:bg-background border-border-subtle'}`}
                    >
                      <input 
                        type="radio" 
                        name="site" 
                        value={site.id} 
                        checked={selectedSite === site.id}
                        onChange={(e) => setSelectedSite(e.target.value)}
                        className="w-4 h-4 text-sky focus:ring-sky border-border"
                      />
                      <div className="ml-4 flex items-center">
                        <MapPin className={`w-5 h-5 mr-2 ${selectedSite === site.id ? 'text-sky' : 'text-foreground-faint'}`} />
                        <span className={`font-medium ${selectedSite === site.id ? 'text-navy' : 'text-foreground-label'}`}>{site.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-end bg-background rounded-b-xl border-t">
              <Button 
                onClick={() => setStep(2)} 
                disabled={!selectedSite}
                className="mt-4"
              >
                Continue to Safety Briefing
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 2 && (
          <Card className="shadow-lg border-t-4 border-t-orange">
            <CardHeader className="bg-orange/5 pb-4">
              <CardTitle className="flex items-center text-orange-dark">
                <AlertTriangle className="w-6 h-6 mr-2" /> Site Rules & Hazards
              </CardTitle>
              <CardDescription className="text-foreground-label font-medium mt-2">
                Review the specific requirements for {sites.find(s => s.id === selectedSite)?.name}.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="bg-card border rounded-md p-4 mb-6 h-64 overflow-y-auto text-sm text-foreground-label space-y-4 shadow-inner">
                {(() => {
                  const site = sites.find(s => s.id === selectedSite);
                  if (!site) return null;
                  return (
                    <>
                      <div className="mb-4">
                        <h4 className="font-bold text-navy mb-2">General Rules</h4>
                        <p><strong>1. Membership:</strong> You must be a current financial member of SAFA and your club.</p>
                        <p><strong>2. Rating:</strong> Ensure you hold the appropriate rating for current conditions. If unsure, DO NOT FLY.</p>
                        <p><strong>3. Airspace:</strong> Be aware of local airspace restrictions. Maximum altitude limits apply.</p>
                      </div>
                      
                      {site.rules && site.rules.length > 0 && (
                        <div className="mb-4">
                          <h4 className="font-bold text-navy mb-2">Site Specific Rules</h4>
                          {site.rules.map((rule: string, idx: number) => (
                            <p key={idx}><strong>{idx + 1}.</strong> {rule}</p>
                          ))}
                        </div>
                      )}

                      {site.hazards && site.hazards.length > 0 && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded text-red-800 mt-4">
                          <h4 className="font-bold mb-2 flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> Known Hazards</h4>
                          <ul className="list-disc pl-5 space-y-1">
                            {site.hazards.map((hazard: string, idx: number) => (
                              <li key={idx}>{hazard}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              <label className="flex items-start space-x-3 cursor-pointer p-2 hover:bg-background rounded">
                <input 
                  type="checkbox" 
                  checked={agreedToRules}
                  onChange={(e) => setAgreedToRules(e.target.checked)}
                  className="mt-1 w-5 h-5 text-orange focus:ring-orange border-border rounded"
                />
                <span className="text-sm font-medium text-foreground">
                  I have read and understood the site rules and hazards. I confirm I hold the appropriate rating and am fit to fly.
                </span>
              </label>
            </CardContent>
            <CardFooter className="flex justify-between bg-background rounded-b-xl border-t">
              <Button variant="outline" onClick={() => setStep(1)} className="mt-4">Back</Button>
              <Button 
                variant="orange" 
                onClick={handleCheckIn} 
                disabled={!agreedToRules || isSubmitting}
                className="mt-4"
              >
                {isSubmitting ? "Processing..." : "Confirm Check-in"}
              </Button>
            </CardFooter>
          </Card>
        )}

        {step === 3 && checkinResult && (
          <Card className="shadow-lg border-t-4 border-t-emerald-500 text-center py-8">
            <CardContent>
              <div className="mx-auto w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-bold text-navy mb-2">Check-in Successful</h2>
              <p className="text-foreground-secondary mb-8 max-w-md mx-auto">
                You are checked in for {sites.find(s => s.id === selectedSite)?.name}. Have a safe and enjoyable flight!
              </p>
              
              <div className="bg-background p-4 rounded-lg inline-block text-left mb-8 border">
                <p className="text-sm text-muted-foreground mb-1">Check-in ID</p>
                <p className="font-mono font-bold text-navy text-lg">{checkinResult.id}</p>
                <p className="text-xs text-foreground-faint mt-2">{new Date(checkinResult.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              </div>

              <div>
                <Button onClick={() => navigate('/sites')} variant="outline" className="mr-4">
                  Back to Sites
                </Button>
                <Button onClick={() => navigate('/')}>
                  Return Home
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
