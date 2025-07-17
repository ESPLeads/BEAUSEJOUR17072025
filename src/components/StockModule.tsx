import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Package, 
  Search,
  Filter,
  Download,
  ArrowUpDown,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  X,
  Settings,
  TrendingUp,
  TrendingDown,
  Users,
  Monitor,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Zap,
  AlertCircle,
  Square,
  CheckSquare
} from 'lucide-react';
import { Product, RegisterSale } from '../types';
import { format, startOfDay, endOfDay, subDays, isAfter, isBefore, parseISO } from 'date-fns';
import { exportToExcel } from '../utils/excelUtils';
import { ProductEditModal } from './ProductEditModal';
import { useViewState, useScrollPosition } from '../hooks/useViewState';
import { useLanguage } from '../contexts/LanguageContext';
import { calculateTotalQuantitySold } from '../utils/salesCalculations';
import { StockImportModule } from './StockImportModule';
import { clearProductSalesCache, debugStockCalculation } from '../utils/calculateStockFinal';

interface StockModuleProps {
  products: Product[];
  registerSales: RegisterSale[];
  loading: boolean;
  onAddProduct: (product: Omit<Product, 'id'>) => Promise<void>;
  onAddProducts: (products: Omit<Product, 'id'>[]) => Promise<void>;
  onUpdateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  onDeleteProduct: (id: string) => Promise<void>;
  onDeleteProducts: (ids: string[]) => Promise<void>;
  onRefreshData: () => void;
  autoSyncProductsFromSales: () => Promise<void>;
  updateStockConfig?: (productId: string, config: { initialStock: number, initialStockDate: string, minStock: number }) => Promise<void>;
  // New props
  stockConfig?: {[productId: string]: { initialStock: number, initialStockDate: string, minStock: number }};
}

interface SmartFilters {
  searchTerm: string;
  dateRange: {
    start: string;
    end: string;
  };
  register: string;
  category: string;
  seller: string;
  stockStatus: 'all' | 'in-stock' | 'low-stock' | 'out-of-stock' | 'not-configured';
  sortField: keyof Product;
  sortDirection: 'asc' | 'desc';
}

export default function StockModule({
  products,
  registerSales,
  loading,
  onAddProduct,
  onAddProducts,
  onUpdateProduct,
  onDeleteProduct,
  onDeleteProducts,
  onRefreshData,
  autoSyncProductsFromSales,
  updateStockConfig,
  stockConfig = {}
}: StockModuleProps) {
  const { t } = useLanguage();
  const { viewState, updateState, updateFilters, updateSelectedItems } = useViewState('stock');
  useScrollPosition('stock');
  
  // Initialize state from viewState with stable defaults
  const [filters, setFilters] = useState<SmartFilters>({
    searchTerm: viewState.searchTerm || '',
    dateRange: viewState.dateRange || {
      start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      end: format(new Date(), 'yyyy-MM-dd')
    },
    register: viewState.filters?.register || 'all',
    category: viewState.filters?.category || 'all',
    seller: viewState.filters?.seller || 'all',
    stockStatus: viewState.filters?.stockStatus || 'all',
    sortField: viewState.sortField as keyof Product || 'name',
    sortDirection: viewState.sortDirection || 'asc'
  });

  const [showEditModal, setShowEditModal] = useState(viewState.modals?.editModal || false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showFilters, setShowFilters] = useState(viewState.showFilters || false);
  const [syncStatus, setSyncStatus] = useState<{
    syncing: boolean;
    success?: boolean;
    message?: string;
  }>({ syncing: false });
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(viewState.selectedItems || new Set());
  const [currentPage, setCurrentPage] = useState(viewState.currentPage || 1);
  const [itemsPerPage, setItemsPerPage] = useState(viewState.itemsPerPage || 20);
  const [showDeleteMultipleModal, setShowDeleteMultipleModal] = useState(false);
  const [isMultiDeleting, setIsMultiDeleting] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showMultiDeleteModal, setShowMultiDeleteModal] = useState(false);
  const [isMultiDeleting2, setIsMultiDeleting2] = useState(false);
  const [showMultiDeleteConfirm, setShowMultiDeleteConfirm] = useState(false);
  const [notification, setNotification] = useState<{
    show: boolean;
    type: 'success' | 'error';
    message: string;
  }>({ show: false, type: 'success', message: '' });

  // Sync state changes back to viewState
  useEffect(() => {
    updateState({
      searchTerm: filters.searchTerm,
      dateRange: filters.dateRange,
      sortField: filters.sortField,
      sortDirection: filters.sortDirection,
      showFilters: showFilters,
      currentPage: currentPage,
      itemsPerPage: itemsPerPage
    });
  }, [filters.searchTerm, filters.dateRange, filters.sortField, filters.sortDirection, showFilters, currentPage, itemsPerPage, updateState]);

  useEffect(() => {
    updateFilters({
      register: filters.register,
      category: filters.category,
      seller: filters.seller,
      stockStatus: filters.stockStatus
    });
  }, [filters.register, filters.category, filters.seller, filters.stockStatus, updateFilters]);

  useEffect(() => {
    updateState({
      modals: { editModal: showEditModal }
    });
  }, [showEditModal, updateState]);

  useEffect(() => {
    updateSelectedItems(selectedProducts);
  }, [selectedProducts, updateSelectedItems]);

  // Get unique values for filter dropdowns
  const uniqueRegisters = useMemo(() => 
    [...new Set(registerSales.map(s => s.register))].sort(), 
    [registerSales]
  );
  
  const uniqueCategories = useMemo(() => 
    [...new Set(registerSales.map(s => s.category))].sort(), 
    [registerSales]
  );
  
  const uniqueSellers = useMemo(() => 
    [...new Set(registerSales.map(s => s.seller))].sort(), 
    [registerSales]
  );

  // Filter products based on smart filters
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    if (filtered.length === 0) {
      return [];
    }

    // Search filter
    if (filters.searchTerm) {
      filtered = filtered.filter(product =>
        product.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        product.category.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }

    // Date range filter (based on last sale date)
    if (filters.dateRange.start || filters.dateRange.end) {
      filtered = filtered.filter(product => {
        if (!product.lastSale) return false;

        const lastSaleDate = product.lastSale;
        let matchesDateRange = true;
        
        if (filters.dateRange.start) {
          const startDate = startOfDay(new Date(filters.dateRange.start));
          matchesDateRange = matchesDateRange && isAfter(lastSaleDate, startDate);
        }
        
        if (filters.dateRange.end) {
          const endDate = endOfDay(new Date(filters.dateRange.end));
          matchesDateRange = matchesDateRange && isBefore(lastSaleDate, endDate);
        }
        
        return matchesDateRange;
      });
    }

    // Register filter
    if (filters.register !== 'all') {
      filtered = filtered.filter(product => {
        const productSales = registerSales.filter(sale => 
          sale.product === product.name && sale.category === product.category
        );
        return productSales.some(sale => sale.register === filters.register);
      });
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(product => product.category === filters.category);
    }

    // Seller filter
    if (filters.seller !== 'all') {
      filtered = filtered.filter(product => {
        const productSales = registerSales.filter(sale => 
          sale.product === product.name && sale.category === product.category
        );
        return productSales.some(sale => sale.seller === filters.seller);
      });
    }

    // Stock status filter
    if (filters.stockStatus !== 'all') {
      filtered = filtered.filter(product => {
        switch (filters.stockStatus) {
          case 'in-stock':
            return product.stock > product.minStock;
          case 'low-stock':
            return product.stock > 0 && product.stock <= product.minStock;
          case 'out-of-stock':
            return product.stock === 0;
          case 'not-configured':
            return !product.isConfigured;
          default:
            return true;
        }
      });
    }

    // Sort products
    filtered.sort((a, b) => {
      const aValue = a[filters.sortField];
      const bValue = b[filters.sortField];
      
      let comparison = 0;
      if (aValue < bValue) comparison = -1;
      if (aValue > bValue) comparison = 1;
      
      return filters.sortDirection === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [products, registerSales, filters]);

  // Pagination logic
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, endIndex);

  // Selection handlers
  const toggleSelectProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === paginatedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedProducts.map(product => product.id)));
    }
  };

  const handleMultiDelete = async () => {
    if (selectedProducts.size === 0) return;
    setShowMultiDeleteConfirm(true);
  };

  const confirmMultiDelete = async () => {
    if (selectedProducts.size === 0 || !onDeleteProducts) return;

    setIsMultiDeleting(true);
    try {
      console.log(`🗑️ Deleting ${selectedProducts.size} products:`, Array.from(selectedProducts));
      await onDeleteProducts(Array.from(selectedProducts));
      setSelectedProducts(new Set());
      setShowMultiDeleteConfirm(false);
      onRefreshData();
    } catch (error) {
      console.error('Error deleting products:', error);
    } finally {
      setIsMultiDeleting(false);
    }
  };

  // Calculate statistics
  const statistics = useMemo(() => {
    // Start with all products
    let relevantProducts = products;
    
    // Apply search term filter
    if (filters.searchTerm) {
      relevantProducts = relevantProducts.filter(product =>
        product.name.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        product.category.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        (product.description && product.description.toLowerCase().includes(filters.searchTerm.toLowerCase()))
      );
    }
    
    // Filter sales based on current filters
    let filteredSales = registerSales;
    
    // Apply search term filter to sales as well
    if (filters.searchTerm) {
      filteredSales = filteredSales.filter(sale =>
        sale.product.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        sale.category.toLowerCase().includes(filters.searchTerm.toLowerCase()) ||
        sale.seller.toLowerCase().includes(filters.searchTerm.toLowerCase())
      );
    }
    
    // Apply date range filter
    if (filters.dateRange.start || filters.dateRange.end) {
      const start = filters.dateRange.start ? startOfDay(new Date(filters.dateRange.start)) : new Date(0);
      const end = filters.dateRange.end ? endOfDay(new Date(filters.dateRange.end)) : new Date();
      
      filteredSales = filteredSales.filter(sale => 
        isAfter(sale.date, start) && isBefore(sale.date, end)
      );
    }
    
    // Apply register filter
    if (filters.register !== 'all') {
      filteredSales = filteredSales.filter(sale => sale.register === filters.register);
    }
    
    // Apply category filter
    if (filters.category !== 'all') {
      filteredSales = filteredSales.filter(sale => sale.category === filters.category);
    }
    
    // Apply seller filter
    if (filters.seller !== 'all') {
      filteredSales = filteredSales.filter(sale => sale.seller === filters.seller);
    }
    
    // Apply category filter to products directly
    if (filters.category !== 'all') {
      relevantProducts = relevantProducts.filter(product => product.category === filters.category);
    }
    
    // Calculate total revenue from filtered sales
    const totalRevenue = filteredSales.reduce((sum, sale) => sum + sale.total, 0);
    
    // Filter products based on filtered sales
    const relevantProductNames = new Set(filteredSales.map(sale => `${sale.product}-${sale.category}`));
    
    // If we have register or seller filters, further filter products to only those that appear in filtered sales
    if (filters.register !== 'all' || filters.seller !== 'all') {
      relevantProducts = relevantProducts.filter(product => 
        relevantProductNames.has(`${product.name}-${product.category}`)
      );
    }
    
    // Apply stock status filter
    if (filters.stockStatus !== 'all') {
      relevantProducts = relevantProducts.filter(product => {
        switch (filters.stockStatus) {
          case 'in-stock':
            return product.stock > product.minStock;
          case 'low-stock':
            return product.stock > 0 && product.stock <= product.minStock;
          case 'out-of-stock':
            return product.stock === 0;
          case 'not-configured':
            return !product.isConfigured;
          default:
            return true;
        }
      });
    }
    
    // Calculate statistics based on filtered products
    const configuredProducts = relevantProducts.filter(p => p.isConfigured).length;
    const inStockProducts = relevantProducts.filter(p => p.stock > p.minStock).length;
    const lowStockProducts = relevantProducts.filter(p => p.stock > 0 && p.stock <= p.minStock && p.isConfigured).length;
    const outOfStockProducts = relevantProducts.filter(p => p.stock === 0).length;
    const totalStockValue = relevantProducts.reduce((sum, p) => sum + (p.stockValue || 0), 0);
    const totalQuantitySold = filteredSales.reduce((sum, sale) => sum + sale.quantity, 0);

    // Calculate percentage of products with issues
    const totalProducts = relevantProducts.length;
    const lowStockPercentage = totalProducts > 0 ? (lowStockProducts / totalProducts) * 100 : 0;
    const outOfStockPercentage = totalProducts > 0 ? (outOfStockProducts / totalProducts) * 100 : 0;

    return {
      configuredProducts,
      inStockProducts,
      lowStockProducts,
      outOfStockProducts,
      lowStockPercentage,
      outOfStockPercentage,
      totalStockValue,
      totalQuantitySold,
      totalRevenue
    };
  }, [products, registerSales, filters]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount);
  };

  const getStockStatus = (product: Product) => {
    if (!product.isConfigured || !stockConfig[product.id]) {
      return { status: 'not-configured', color: 'text-gray-400', bg: 'bg-gray-500/20', label: 'Non configuré' };
    }
    if (product.stock === 0) {
      return { status: 'out-of-stock', color: 'text-red-400', bg: 'bg-red-500/20', label: 'Rupture' };
    }
    if (product.stock <= product.minStock) {
      return { status: 'low-stock', color: 'text-orange-400', bg: 'bg-orange-500/20', label: 'Stock faible' };
    }
    return { status: 'in-stock', color: 'text-green-400', bg: 'bg-green-500/20', label: 'En stock' };
  };

  const handleSort = (field: keyof Product) => {
    setFilters(prev => ({
      ...prev,
      sortField: field,
      sortDirection: prev.sortField === field && prev.sortDirection === 'asc' ? 'desc' : 'asc',
    }));
    setCurrentPage(1); // Reset to first page when sorting changes
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setShowEditModal(true);
  };

  // Show notification helper
  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ show: true, type, message });
    // Auto-hide after 3 seconds
    setTimeout(() => {
      setNotification(prev => ({ ...prev, show: false }));
    }, 3000);
  };

  const handleSaveProduct = async (updates: Partial<Product>) => {
    if (!editingProduct) return;
    
    console.log('🔄 Saving product updates:', updates);
    
    try {
      if (onUpdateProduct) {
        // Debug the stock calculation before saving
        if (updates.initialStock !== undefined && updates.initialStockDate) {
          console.log('🔍 DEBUG: Stock calculation before saving');
          const debugProduct = {
            ...editingProduct,
            initialStock: updates.initialStock,
            initialStockDate: updates.initialStockDate
          };
          debugStockCalculation(debugProduct, registerSales);
        }
        
        await onUpdateProduct(editingProduct.id, updates);
        setShowEditModal(false);
        setEditingProduct(null);
        onRefreshData();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating product:', error);
      throw error;
    }
  };

  const handleDeleteProduct = async (productId: string) => {
    try {
      await onDeleteProduct(productId);
      // Refresh data after deletion
      onRefreshData();
    } catch (error) {
      console.error('Error deleting product:', error);
    }
  };

  // Handle multiple product deletion
  const handleMultipleDelete = async () => {
    if (selectedProducts.size === 0) return;
    
    setIsMultiDeleting(true);
    try {
      await onDeleteProducts(Array.from(selectedProducts));
      setSelectedProducts(new Set());
      setShowDeleteMultipleModal(false);
      onRefreshData();
    } catch (error) {
      console.error('Error deleting multiple products:', error);
    } finally {
      setIsMultiDeleting(false);
    }
  };

  // Toggle select all products on current page
  const toggleSelectAllProducts = () => {
    if (selectedProducts.size === paginatedProducts.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(paginatedProducts.map(p => p.id)));
    }
  };

  // Toggle select single product
  const toggleSelectSingleProduct = (productId: string) => {
    const newSelected = new Set(selectedProducts);
    if (newSelected.has(productId)) {
      newSelected.delete(productId);
    } else {
      newSelected.add(productId);
    }
    setSelectedProducts(newSelected);
  };

  const handleSyncProducts = async () => {
    setSyncStatus({ syncing: true });
    try {
      await autoSyncProductsFromSales();
      setSyncStatus({ 
        syncing: false, 
        success: true, 
        message: `Synchronisation réussie. ${products.length} produits détectés.` 
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setSyncStatus({ syncing: false });
      }, 3000);
    } catch (error) {
      console.error('Error syncing products:', error);
      setSyncStatus({ 
        syncing: false, 
        success: false, 
        message: 'Erreur lors de la synchronisation.' 
      });
    }
  };

  const handleExport = () => {
    const exportData = filteredProducts.map(product => ({
      Produit: product.name,
      Catégorie: product.category,
      'Prix Moyen': product.price,
      'Stock Initial': product.initialStock || 0,
      'Quantité Vendue': product.quantitySold || 0,
      'Stock Final': product.stock,
      'Stock Minimum': product.minStock,
      'Valeur Stock': product.stockValue || 0,
      'Date Effet': product.initialStockDate || '',
      'Dernière Vente': product.lastSale ? format(product.lastSale, 'dd/MM/yyyy') : '',
      'Statut': getStockStatus(product).label,
      'Configuré': product.isConfigured ? 'Oui' : 'Non'
    }));
    
    exportToExcel(exportData, `stock-${format(new Date(), 'yyyy-MM-dd')}`);
  };

  const clearFilters = () => {
    setFilters({
      searchTerm: '',
      dateRange: {
        start: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
        end: format(new Date(), 'yyyy-MM-dd')
      },
      register: 'all',
      category: 'all',
      seller: 'all',
      stockStatus: 'all',
      sortField: 'name',
      sortDirection: 'asc'
    });
  };

  const hasActiveFilters = filters.searchTerm || 
    filters.register !== 'all' || 
    filters.category !== 'all' || 
    filters.seller !== 'all' || 
    filters.stockStatus !== 'all' ||
    filters.dateRange.start !== format(subDays(new Date(), 30), 'yyyy-MM-dd') ||
    filters.dateRange.end !== format(new Date(), 'yyyy-MM-dd');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
          className="w-6 h-6 border border-blue-400/30 border-t-blue-400 rounded-full"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Gestion du Stock</h1>
          <p className="text-gray-400">
            {hasActiveFilters ? 
              `Affichage de ${filteredProducts.length} produits sur ${products.length} au total` : 
              'Gérez votre inventaire et suivez les niveaux de stock'}
          </p>
        </div>
        
        <div className="flex space-x-3">
          {/* Sync Button with Status */}
          <div className="relative">
            <button
              onClick={handleSyncProducts}
              disabled={syncStatus.syncing}
              className="bg-gradient-to-r from-purple-500 to-purple-600 text-white font-semibold 
                         py-3 px-6 rounded-xl hover:from-purple-600 hover:to-purple-700 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 flex items-center space-x-2"
            >
              {syncStatus.syncing ? (
                <RefreshCw className="w-5 h-5 animate-spin" />
              ) : (
                <Zap className="w-5 h-5" />
              )}
              <span>Synchroniser</span>
            </button>
            
            {/* Success/Error Message */}
            <AnimatePresence>
              {syncStatus.message && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className={`absolute top-full right-0 mt-2 px-3 py-2 rounded-lg text-sm whitespace-nowrap ${
                    syncStatus.success 
                      ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}
                >
                  {syncStatus.message}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          
          <button
            onClick={onRefreshData}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-blue-600 hover:to-blue-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Actualiser</span>
          </button>
          
          <button
            onClick={handleExport}
            className="bg-gradient-to-r from-green-500 to-green-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-green-600 hover:to-green-700 
                       transition-all duration-200 flex items-center space-x-2"
          >
            <Download className="w-5 h-5" />
            <span>Exporter</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -50, scale: 0.95 }}
            className="fixed top-4 right-4 z-50"
          >
            <div className={`p-4 rounded-xl border shadow-2xl backdrop-blur-xl flex items-center space-x-3 min-w-80 ${
              notification.type === 'success'
                ? 'bg-green-500/20 border-green-500/30 text-green-400'
                : 'bg-red-500/20 border-red-500/30 text-red-400'
            }`}>
              {notification.type === 'success' ? (
                <CheckCircle className="w-6 h-6 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-6 h-6 flex-shrink-0" />
              )}
              <span className="font-medium flex-1">{notification.message}</span>
              <button
                onClick={() => setNotification(prev => ({ ...prev, show: false }))}
                className="text-gray-400 hover:text-white transition-colors duration-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No Products Notice */}
      {products.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-6 text-center"
        >
          <Package className="w-16 h-16 text-blue-400 mx-auto mb-4 opacity-50" />
          <h3 className="text-xl font-semibold text-white mb-2">Aucun produit détecté</h3>
          <p className="text-slate-400 mb-6">
            Les produits sont automatiquement extraits des données de vente.
            <br />
            Importez des ventes ou utilisez le bouton "Synchroniser" pour détecter les produits.
          </p>
          
          <button
            onClick={handleSyncProducts}
            disabled={syncStatus.syncing}
            className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold 
                       py-3 px-6 rounded-xl hover:from-blue-600 hover:to-blue-700 
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 inline-flex items-center space-x-2"
          >
            {syncStatus.syncing ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Zap className="w-5 h-5" />
            )}
            <span>Synchroniser maintenant</span>
          </button>
        </motion.div>
      )}

      {/* Multiple Selection Actions */}
      {selectedProducts.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-blue-500/20 to-purple-500/20 backdrop-blur-xl 
                     border border-blue-500/30 rounded-2xl p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <CheckSquare className="w-5 h-5 text-blue-400" />
              <span className="text-white font-medium">
                {selectedProducts.size} produit(s) sélectionné(s)
              </span>
            </div>
            
            <div className="flex space-x-3">
              <button
                onClick={handleMultiDelete}
                className="bg-red-500/20 text-red-400 px-4 py-2 rounded-lg hover:bg-red-500/30 
                           transition-all duration-200 flex items-center space-x-2 text-sm"
              >
                <Trash2 className="w-4 h-4" />
                <span>Supprimer la sélection</span>
              </button>
              
              <button
                onClick={() => setSelectedProducts(new Set())}
                className="bg-gray-500/20 text-gray-400 px-4 py-2 rounded-lg hover:bg-gray-500/30 
                           transition-all duration-200 text-sm"
              >
                Annuler
              </button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Statistics Cards */}
      {products.length > 0 && <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-7 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-xl 
                     border border-green-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-green-400" />
            <div>
              <p className="text-slate-400 text-sm">CA Total</p>
              <p className="text-xl font-bold text-white">{formatCurrency(statistics.totalRevenue)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 backdrop-blur-xl 
                     border border-purple-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-purple-400" />
            <div>
              <p className="text-slate-400 text-sm">Configurés</p>
              <p className="text-2xl font-bold text-white">{statistics.configuredProducts}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="bg-gradient-to-br from-green-500/10 to-green-600/10 backdrop-blur-xl 
                     border border-green-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <p className="text-slate-400 text-sm">En Stock</p>
              <p className="text-2xl font-bold text-white">{statistics.inStockProducts}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 backdrop-blur-xl 
                     border border-orange-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <AlertTriangle className="w-6 h-6 text-orange-400" />
            <div>
              <p className="text-slate-400 text-sm">Stock Faible {statistics.lowStockPercentage > 0 && (
                <span className="text-xs">({statistics.lowStockPercentage.toFixed(1)}%)</span>
              )}</p>
              <p className="text-2xl font-bold text-white">
                {statistics.lowStockProducts}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45 }}
          className="bg-gradient-to-br from-red-500/10 to-red-600/10 backdrop-blur-xl 
                     border border-red-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <X className="w-6 h-6 text-red-400" />
            <div>
              <p className="text-slate-400 text-sm">Rupture {statistics.outOfStockPercentage > 0 && (
                <span className="text-xs">({statistics.outOfStockPercentage.toFixed(1)}%)</span>
              )}</p>
              <p className="text-2xl font-bold text-white">
                {statistics.outOfStockProducts}
              </p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55 }}
          className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/10 backdrop-blur-xl 
                     border border-cyan-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <CreditCard className="w-6 h-6 text-cyan-400" />
            <div>
              <p className="text-slate-400 text-sm">Valeur Stock</p>
              <p className="text-xl font-bold text-white">{formatCurrency(statistics.totalStockValue)}</p>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="bg-gradient-to-br from-yellow-500/10 to-yellow-600/10 backdrop-blur-xl 
                     border border-yellow-500/20 rounded-xl p-4"
        >
          <div className="flex items-center space-x-3">
            <TrendingUp className="w-6 h-6 text-yellow-400" />
            <div>
              <p className="text-slate-400 text-sm">Quantité Vendue</p>
              <p className="text-2xl font-bold text-white">{statistics.totalQuantitySold}</p>
            </div>
          </div>
        </motion.div>
      </div>}

      {/* Smart Filters */}
      {products.length > 0 && <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Filter className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Filtres Intelligents</h3>
            {hasActiveFilters && (
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded-full text-xs">
                {filteredProducts.length} résultats
              </span>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors duration-200"
            >
              {showFilters ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              <span className="text-sm">{showFilters ? 'Masquer' : 'Afficher'}</span>
            </button>
            
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-sm text-slate-400 hover:text-white transition-colors duration-200 
                           bg-slate-700/50 hover:bg-slate-700 px-3 py-1 rounded-lg"
              >
                Effacer
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4"
            >
              {/* Search and Date Range */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <input
                    type="text"
                    placeholder="Rechercher un produit..."
                    value={filters.searchTerm}
                    onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                    className="w-full pl-10 pr-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                               placeholder-slate-400 focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Date de début</label>
                  <input
                    type="date"
                    value={filters.dateRange.start}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      dateRange: { ...prev.dateRange, start: e.target.value }
                    }))}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                               focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Date de fin</label>
                  <input
                    type="date"
                    value={filters.dateRange.end}
                    onChange={(e) => setFilters(prev => ({ 
                      ...prev, 
                      dateRange: { ...prev.dateRange, end: e.target.value }
                    }))}
                    className="w-full px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                               focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Dropdown Filters */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <select
                  value={filters.register}
                  onChange={(e) => setFilters(prev => ({ ...prev, register: e.target.value }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Toutes les caisses</option>
                  {uniqueRegisters.map(register => (
                    <option key={register} value={register}>{register}</option>
                  ))}
                </select>
                
                <select
                  value={filters.category}
                  onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Toutes les catégories</option>
                  {uniqueCategories.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                
                <select
                  value={filters.seller}
                  onChange={(e) => setFilters(prev => ({ ...prev, seller: e.target.value }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Tous les vendeurs</option>
                  {uniqueSellers.map(seller => (
                    <option key={seller} value={seller}>{seller}</option>
                  ))}
                </select>
                
                <select
                  value={filters.stockStatus}
                  onChange={(e) => setFilters(prev => ({ ...prev, stockStatus: e.target.value as any }))}
                  className="px-4 py-3 bg-slate-700/50 border border-slate-600 rounded-lg text-white
                             focus:outline-none focus:border-blue-500"
                >
                  <option value="all">Tous les statuts</option>
                  <option value="in-stock">En stock</option>
                  <option value="low-stock">Stock faible</option>
                  <option value="out-of-stock">Rupture</option>
                  <option value="not-configured">Non configuré</option>
                </select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Pagination Controls */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0">
            <div className="flex items-center space-x-4">
              <span className="text-slate-400 text-sm">Affichage par page:</span>
              <select
                value={itemsPerPage}
                onChange={(e) => {
                  setItemsPerPage(Number(e.target.value));
                  setCurrentPage(1); // Reset to first page when changing items per page
                }}
                className="px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm
                           focus:outline-none focus:border-blue-500"
              >
                <option value={20}>20</option>
                <option value={30}>30</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span className="text-slate-400 text-sm">
                {startIndex + 1}-{Math.min(endIndex, filteredProducts.length)} sur {filteredProducts.length}
              </span>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="p-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                             disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => setCurrentPage(pageNum)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                          currentPage === pageNum
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="p-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 
                             disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>}

      {/* Products Table */}
      {products.length > 0 && <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }} 
        className="bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white">
            Produits ({filteredProducts.length}{products.length !== filteredProducts.length ? ` sur ${products.length}` : ''})
          </h3>
          {hasActiveFilters && (
            <div className="flex items-center space-x-2 text-sm text-slate-400 bg-blue-500/10 px-3 py-1 rounded-lg border border-blue-500/20">
              <Filter className="w-4 h-4 text-blue-400" />
              <span>Filtres actifs</span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto mb-4">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left py-4 px-4">
                  <button
                    onClick={toggleSelectAll}
                    className="text-gray-400 hover:text-white transition-colors duration-200"
                  >
                    {selectedProducts.size === paginatedProducts.length && paginatedProducts.length > 0 ? (
                      <CheckSquare className="w-5 h-5" />
                    ) : (
                      <Square className="w-5 h-5" />
                    )}
                  </button>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Produit</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Catégorie</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Prix Moyen</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Stock Initial</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Quantité Vendue</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Stock Final</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Stock Min</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Valeur Stock</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Dernière Vente</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Statut</span>
                </th>
                <th className="text-left py-4 px-4">
                  <span className="text-gray-400 font-medium">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedProducts.map((product) => (
                <tr 
                  key={product.id} 
                  className={`border-b border-gray-700/50 hover:bg-gray-700/20 transition-colors duration-200 ${
                    selectedProducts.has(product.id) ? 'bg-blue-500/10' : ''
                  }`}
                >
                  <td className="py-4 px-4">
                    <button
                      onClick={() => toggleSelectProduct(product.id)}
                      className="text-gray-400 hover:text-blue-400 transition-colors duration-200"
                    >
                      {selectedProducts.has(product.id) ? (
                        <CheckSquare className="w-5 h-5 text-blue-400" />
                      ) : (
                        <Square className="w-5 h-5" />
                      )}
                    </button>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-white font-medium">{product.name}</div>
                  </td>
                  <td className="py-4 px-4">
                    <span className="bg-purple-500/20 text-purple-400 px-2 py-1 rounded-full text-xs font-medium">
                      {product.category}
                    </span>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-gray-300">{formatCurrency(product.price)}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-gray-300">{product.initialStock || 0}</div>
                    {product.initialStockDate && (
                      <div className="text-xs text-gray-500">
                        Depuis: {format(parseISO(product.initialStockDate), 'dd/MM/yyyy')}
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-blue-400 font-medium">{product.quantitySold || 0}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className={`font-bold ${
                      product.stock === 0 ? 'text-red-400' :
                      product.stock <= product.minStock ? 'text-orange-400' :
                      'text-green-400'
                    }`}>
                      {product.stock}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-gray-300">{product.minStock}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-gray-300">{formatCurrency(product.stockValue || 0)}</div>
                  </td>
                  <td className="py-4 px-4">
                    <div className="text-gray-300 text-sm">
                      {product.lastSale ? format(product.lastSale, 'dd/MM/yyyy') : '-'}
                    </div>
                  </td>
                  <td className="py-4 px-4">
                    {(() => {
                      const status = getStockStatus(product);
                      return (
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.bg} ${status.color}`}>
                          {status.label}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="py-4 px-4">
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => handleEditProduct(product)}
                        className="p-2 bg-blue-500/20 text-blue-400 rounded-lg hover:bg-blue-500/30 
                                   transition-all duration-200"
                        title="Modifier le produit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDeleteProduct(product.id)}
                        className="p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 
                                   transition-all duration-200"
                        title="Supprimer le produit"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {filteredProducts.length === 0 && (
            <div className="text-center py-8 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
              <p>Aucun produit trouvé</p>
              {hasActiveFilters && (
                <p className="text-sm mt-1">Essayez de modifier vos filtres</p>
              )}
            </div>
          )}
        </div>
      </motion.div>}

      {/* Multiple Delete Confirmation Modal */}
      <AnimatePresence>
        {showMultiDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression multiple</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Attention :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• Vous allez supprimer <strong>{selectedProducts.size}</strong> produits</div>
                  <div>• Cette action est définitive et irréversible</div>
                  <div>• Les ventes associées à ces produits resteront dans l'historique mais seront orphelines</div>
                  <div>• Les statistiques, rapports et analyses seront impactés</div>
                  <div className="mt-2 pt-2 border-t border-red-500/20 text-red-300 font-medium">
                    Êtes-vous absolument sûr de vouloir supprimer ces produits ?
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={confirmMultiDelete}
                  disabled={isMultiDeleting}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isMultiDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Suppression...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmer la suppression</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setShowMultiDeleteConfirm(false)}
                  disabled={isMultiDeleting}
                  className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                             hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Product Edit Modal */}
      {showEditModal && editingProduct && (
        <ProductEditModal
          product={editingProduct}
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingProduct(null);
            setSelectedProducts(new Set());
          }}
          onSave={handleSaveProduct}
          isLoading={isUpdating}
          onDeleteProduct={handleDeleteProduct}
          allSales={registerSales}
          stockConfig={stockConfig}
        />
      )}

      {/* Multiple Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteMultipleModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-lg"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression multiple</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Attention :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• Vous êtes sur le point de supprimer <strong>{selectedProducts.size} produits</strong></div>
                  <div>• La suppression est définitive et irréversible</div>
                  <div>• Toutes les ventes associées à ces produits resteront dans l'historique mais seront orphelines</div>
                  <div>• Les statistiques, rapports et analyses seront impactés</div>
                  <div className="mt-2 pt-2 border-t border-red-500/20 text-red-300 font-medium">
                    Êtes-vous absolument sûr de vouloir supprimer ces produits ?
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleMultipleDelete}
                  disabled={isMultiDeleting}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isMultiDeleting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Suppression...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmer la suppression</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setShowDeleteMultipleModal(false)}
                  disabled={isMultiDeleting}
                  className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                             hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Multiple Delete Confirmation Modal */}
      <AnimatePresence>
        {showMultiDeleteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression multiple</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Attention :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• <strong>{selectedProductIds.size}</strong> produits seront supprimés définitivement</div>
                  <div>• Toutes les ventes associées à ces produits resteront dans l'historique mais seront orphelines</div>
                  <div>• Les statistiques, rapports et analyses seront impactés</div>
                  <div>• Cette action ne peut pas être annulée</div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={confirmMultiDelete}
                  disabled={isMultiDeleting2}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isMultiDeleting2 ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Suppression...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Confirmer la suppression</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setShowMultiDeleteModal(false)}
                  disabled={isMultiDeleting2}
                  className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                             hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200"
                >
                  Annuler
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}