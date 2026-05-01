import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Phone, Navigation, MapPin } from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Hospital {
  name: string;
  lat: number;
  lon: number;
  distanceKm: number;
  phone: string | null;
}

interface EmergencyMedicalCardProps {
  siteId: string;
  siteLat: number;
  siteLon: number;
  what3words?: string;
}

const hospitalIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const siteIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function FitBounds({ bounds }: { bounds: L.LatLngBoundsExpression }) {
  const map = useMap();
  useEffect(() => {
    map.fitBounds(bounds, { padding: [30, 30], maxZoom: 12 });
  }, [map, bounds]);
  return null;
}

export function EmergencyMedicalCard({ siteId, siteLat, siteLon, what3words }: EmergencyMedicalCardProps) {
  const { data: hospitalData, isLoading: loading, isError: error } = useQuery({
    queryKey: ['sites', siteId, 'emergency-hospitals'],
    queryFn: () => api.get<{ hospitals: Hospital[] }>(`/api/sites/${siteId}/emergency-hospitals`),
    enabled: !!siteId,
    staleTime: 10 * 60 * 1000,
  });

  const hospitals = hospitalData?.hospitals || [];

  const bounds = useMemo(() => {
    if (hospitals.length === 0) return null;
    const points: [number, number][] = [[siteLat, siteLon], ...hospitals.map((h) => [h.lat, h.lon] as [number, number])];
    return L.latLngBounds(points.map((p) => L.latLng(p[0], p[1])));
  }, [hospitals, siteLat, siteLon]);

  if (loading) {
    return (
      <Card className="border-t-4 border-t-red-500 shadow-md">
        <CardHeader className="bg-red-50 pb-4">
          <CardTitle className="flex items-center text-red-700">
            <AlertTriangle className="w-5 h-5 mr-2" /> Emergency Medical
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-red-500" />
            <span className="ml-3 text-sm text-muted-foreground">Loading nearby hospitals...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || hospitals.length === 0) {
    return (
      <Card className="border-t-4 border-t-red-500 shadow-md">
        <CardHeader className="bg-red-50 pb-4">
          <CardTitle className="flex items-center text-red-700">
            <AlertTriangle className="w-5 h-5 mr-2" /> Emergency Medical
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
            <p className="text-red-700 font-bold text-lg mb-1">Call 000</p>
            <p className="text-sm text-red-600">In an emergency, call Triple Zero (000)</p>
          </div>
          {hospitals.length === 0 && !error && (
            <p className="text-xs text-muted-foreground mt-3 text-center">
              No hospital emergency departments found within 100km.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-t-4 border-t-red-500 shadow-md">
      <CardHeader className="bg-red-50 pb-4">
        <CardTitle className="flex items-center text-red-700">
          <AlertTriangle className="w-5 h-5 mr-2" /> Emergency Medical
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
          <p className="text-red-700 font-bold text-lg mb-0.5">Call 000</p>
          <p className="text-xs text-red-600">In an emergency, always call Triple Zero first</p>
          {what3words && (
            <p className="text-xs text-red-500 mt-1">
              Site location: <span className="font-mono font-semibold">{what3words}</span>
            </p>
          )}
        </div>

        {bounds && (
          <div className="rounded-lg overflow-hidden border border-red-200" style={{ height: "220px" }}>
            <MapContainer
              center={[siteLat, siteLon]}
              zoom={10}
              style={{ height: "100%", width: "100%" }}
              zoomControl={true}
              scrollWheelZoom={false}
              touchZoom={true}
              attributionControl={false}
            >
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <FitBounds bounds={bounds} />
              <Marker position={[siteLat, siteLon]} icon={siteIcon}>
                <Popup>
                  <strong>Flying Site</strong>
                </Popup>
              </Marker>
              {hospitals.map((h, i) => (
                <Marker key={i} position={[h.lat, h.lon]} icon={hospitalIcon}>
                  <Popup>
                    <div className="text-sm">
                      <strong>{h.name}</strong>
                      <br />
                      <span className="text-muted-foreground">~{h.distanceKm} km away</span>
                      {h.phone && (
                        <>
                          <br />
                          <a href={`tel:${h.phone}`} className="text-red-600 font-semibold">
                            {h.phone}
                          </a>
                        </>
                      )}
                      <br />
                      <a
                        href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline text-xs"
                      >
                        Navigate to →
                      </a>
                      <br />
                      <span style={{ color: "#b91c1c", fontWeight: 600, fontSize: "11px" }}>
                        Emergency: Call 000
                      </span>
                      {what3words && (
                        <>
                          <br />
                          <span style={{ color: "#666", fontSize: "10px" }}>
                            Site w3w: {what3words}
                          </span>
                        </>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>
        )}

        <ul className="space-y-3">
          {hospitals.map((h, i) => (
            <li key={i} className="bg-white border border-red-100 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-sm text-gray-900 leading-tight">{h.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <MapPin className="w-3 h-3 inline mr-0.5" />
                    ~{h.distanceKm} km approx
                  </p>
                </div>
                <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full shrink-0">
                  #{i + 1}
                </span>
              </div>
              <div className="flex gap-2 mt-2">
                {h.phone && (
                  <a
                    href={`tel:${h.phone}`}
                    className="flex items-center gap-1 text-xs bg-red-50 hover:bg-red-100 text-red-700 px-2.5 py-1.5 rounded-md transition-colors"
                  >
                    <Phone className="w-3 h-3" /> Call
                  </a>
                )}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lon}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs bg-blue-50 hover:bg-blue-100 text-blue-700 px-2.5 py-1.5 rounded-md transition-colors"
                >
                  <Navigation className="w-3 h-3" /> Navigate
                </a>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}