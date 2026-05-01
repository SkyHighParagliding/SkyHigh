import { ExternalLink, ShoppingBag, AlertCircle, EyeOff, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/apiClient";

interface Product {
  id: string;
  name: string;
  description: string;
  price: string;
  currency: string;
  images: string[];
  stockStatus: string;
  quantity: number | null;
  slug: string;
  shopUrl: string;
  category: string;
  hidden?: boolean;
}

export function Shop() {
  const { user, token } = useAuth();
  const isAdmin = !!user?.isAdmin;
  const qc = useQueryClient();

  const { data: products = [], isLoading, error } = useQuery({
    queryKey: ['shop', 'products', isAdmin],
    queryFn: () => {
      const url = isAdmin ? "/api/shop/products?showAll=true" : "/api/shop/products";
      return api.get<Product[]>(url, isAdmin ? token : undefined);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (product: Product) =>
      api.put(`/api/shop/products/${product.id}/visibility`, { hidden: !product.hidden }, token),
    onMutate: async (product) => {
      await qc.cancelQueries({ queryKey: ['shop', 'products', isAdmin] });
      const prev = qc.getQueryData<Product[]>(['shop', 'products', isAdmin]);
      qc.setQueryData<Product[]>(['shop', 'products', isAdmin], old =>
        old?.map(p => p.id === product.id ? { ...p, hidden: !p.hidden } : p) ?? []
      );
      return { prev };
    },
    onError: (_err, _product, ctx) => {
      if (ctx?.prev) qc.setQueryData(['shop', 'products', isAdmin], ctx.prev);
    },
  });

  const formatPrice = (price: string, currency: string) => {
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency || "AUD" }).format(num);
  };

  return (
    <div className="bg-background min-h-screen py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-sky/10 mb-4">
            <ShoppingBag className="w-8 h-8 text-sky" />
          </div>
          <h1 className="text-4xl font-extrabold text-navy mb-3">Shop</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Browse our merchandise and products. Purchases are handled securely through TidyHQ.
          </p>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-sky" />
          </div>
        )}

        {error && (
          <div className="max-w-md mx-auto p-6 bg-amber-50 border border-amber-200 rounded-lg text-center">
            <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
            <p className="text-amber-800">{(error as Error).message}</p>
          </div>
        )}

        {!isLoading && !error && products.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <ShoppingBag className="w-12 h-12 mx-auto mb-4 opacity-30" />
            <p className="text-lg">No products available at the moment.</p>
            <p className="text-sm mt-1">Check back soon!</p>
          </div>
        )}

        {!isLoading && products.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {products.map(product => (
              <div
                key={product.id}
                className={`bg-card rounded-xl shadow-sm border border-border-subtle overflow-hidden hover:shadow-md transition-shadow flex flex-col ${product.hidden ? "opacity-50" : ""}`}
              >
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {product.images.length > 0 ? (
                    <img
                      src={product.images[0]}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ShoppingBag className="w-16 h-16 text-foreground-faint opacity-20" />
                    </div>
                  )}
                  {product.stockStatus === "out_of_stock" && (
                    <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-1 rounded">
                      Out of Stock
                    </div>
                  )}
                  {product.category && (
                    <div className="absolute top-2 left-2 bg-navy/80 text-white text-xs px-2 py-1 rounded">
                      {product.category}
                    </div>
                  )}
                  {isAdmin && product.hidden && (
                    <div className="absolute bottom-2 left-2 bg-amber-500/90 text-white text-xs font-medium px-2 py-1 rounded flex items-center gap-1">
                      <EyeOff className="w-3 h-3" /> Hidden from public
                    </div>
                  )}
                </div>
                <div className="p-5 flex flex-col flex-1">
                  <h3 className="font-semibold text-navy text-lg mb-1">{product.name}</h3>
                  {product.description && (
                    <p className="text-sm text-muted-foreground mb-3 line-clamp-3 flex-1">
                      {product.description.replace(/<[^>]*>/g, "")}
                    </p>
                  )}
                  {!product.description && <div className="flex-1" />}
                  <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-faint">
                    <span className="text-xl font-bold text-navy">
                      {formatPrice(product.price, product.currency)}
                    </span>
                    <div className="flex items-center gap-2">
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className={product.hidden ? "text-amber-600 border-amber-300 hover:bg-amber-50" : "text-muted-foreground"}
                          onClick={() => toggleMutation.mutate(product)}
                          disabled={toggleMutation.isPending}
                        >
                          {product.hidden ? (
                            <><Eye className="w-3.5 h-3.5 mr-1" /> Show</>
                          ) : (
                            <><EyeOff className="w-3.5 h-3.5 mr-1" /> Hide</>
                          )}
                        </Button>
                      )}
                      <a href={product.shopUrl} target="_blank" rel="noopener noreferrer">
                        <Button
                          size="sm"
                          className="bg-sky hover:bg-sky-dark text-white"
                          disabled={product.stockStatus === "out_of_stock"}
                        >
                          Buy Now <ExternalLink className="w-3 h-3 ml-1" />
                        </Button>
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
