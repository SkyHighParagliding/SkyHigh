import { Calendar, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUpcomingEvents } from '@/hooks/api';
import LazyMarkdown from '@/components/LazyMarkdown';

interface TidyHQEvent {
  id: string;
  name: string;
  public_url?: string;
  image_url?: string;
  start_at_iso?: string;
  start_at?: string;
  end_at_iso?: string;
  end_at?: string;
  location?: string;
  body?: string;
}

export function Events() {
  const { data: events = [], isLoading: loading } = useUpcomingEvents();

  return (
    <div className="min-h-screen bg-background pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-extrabold text-navy mb-4 flex items-center justify-center gap-3">
            <Calendar className="w-10 h-10 text-sky" /> Upcoming Events
          </h1>
          <p className="text-xl text-foreground-secondary max-w-2xl mx-auto">
            Join us at our upcoming club events and fly-ins.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky"></div>
          </div>
        ) : events.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {events.map(event => {
                const typedEvent = event as unknown as TidyHQEvent;
                const startDate = new Date(typedEvent.start_at_iso || typedEvent.start_at);
                const endDate = new Date(typedEvent.end_at_iso || typedEvent.end_at);
                const isSameDay = startDate.toDateString() === endDate.toDateString();
                
                return (
                  <a 
                    key={typedEvent.id} 
                    href={typedEvent.public_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="block group"
                  >
                    <Card className="h-full border-none shadow-md hover:shadow-xl transition-all duration-300 overflow-hidden flex flex-col">
                      {typedEvent.image_url && (
                        <div className="h-48 overflow-hidden">
                          <img 
                            src={typedEvent.image_url} 
                            alt={typedEvent.name} 
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            referrerPolicy="no-referrer"
                            loading="lazy"
                          />
                        </div>
                      )}
                      <CardHeader className="bg-sky/5 pb-4 flex-grow">
                        <div className="flex items-center gap-2 text-sm text-sky font-bold mb-2">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {startDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {!isSameDay && ` - ${endDate.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                          </span>
                        </div>
                        <CardTitle className="text-xl text-navy group-hover:text-sky transition-colors line-clamp-2">
                          {typedEvent.name}
                        </CardTitle>
                        {typedEvent.location && (
                          <div className="flex items-center gap-1 text-muted-foreground text-sm mt-2">
                            <MapPin className="w-4 h-4" />
                            <span className="line-clamp-1">{typedEvent.location}</span>
                          </div>
                        )}
                      </CardHeader>
                      <CardContent className="pt-4 bg-card">
                        <div className="text-foreground-secondary text-sm line-clamp-3 prose prose-sm max-w-none">
                          <LazyMarkdown 
                            variant="sanitized"
                            children={typedEvent.body || ''}
                          />
                        </div>
                        <div className="mt-4 text-sky font-semibold text-sm group-hover:underline flex items-center">
                          View Details &rarr;
                        </div>
                      </CardContent>
                    </Card>
                  </a>
                );
              })}
            </div>
            <div className="text-center mt-16">
              <a href="https://skyhigh.tidyhq.com/public/schedule/events" target="_blank" rel="noopener noreferrer">
                <Button variant="outline" size="lg" className="border-sky text-sky hover:bg-sky hover:text-white">
                  View All Events on TidyHQ
                </Button>
              </a>
            </div>
          </>
        ) : (
          <div className="text-center py-20 bg-card rounded-2xl shadow-sm border border-border-faint">
            <Calendar className="w-16 h-16 text-foreground-ghost mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground-label mb-2">No Upcoming Events</h3>
            <p className="text-muted-foreground mb-6">Check back later for new events and fly-ins.</p>
            <a href="https://skyhigh.tidyhq.com/public/schedule/events" target="_blank" rel="noopener noreferrer">
              <Button variant="outline" className="border-sky text-sky hover:bg-sky hover:text-white">
                View Past Events
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
