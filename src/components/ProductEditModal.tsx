import React, { useState, useEffect } from 'react';
import { calculateStockFinal } from '../utils/calculateStockFinal';
import { motion, AnimatePresence } from 'framer-motion';
import { format, parseISO, isValid } from 'date-fns';
import { 
  X, 
  Save,
  RefreshCw,
  Calendar,
  Package, 
  DollarSign,
  Hash,
  Tag,
  FileText,
  AlertTriangle,
  Info,
  Trash2,
  CheckCircle
} from 'lucide-react';
import { Product, RegisterSale } from '../types';
import { validateStockConfiguration, getDefaultInitialStockDate, formatStockDate, clearProductSalesCache } from '../utils/calculateStockFinal';

interface ProductEditModalProps {
  product?: Product; // undefined for create mode
  isOpen: boolean;
  onClose: () => void;
  onSave: (productData: Partial<Product>) => Promise<void>;
  isLoading: boolean;
  allSales?: RegisterSale[]; // For validation warnings
  onDeleteProduct?: (productId: string) => Promise<void>;
  stockConfig?: {[productId: string]: { initialStock: number, initialStockDate: string, minStock: number }};
}

export function ProductEditModal({ 
  product, 
  isOpen, 
  onClose, 
  onSave, 
  isLoading,
  onDeleteProduct,
  allSales = [],
  stockConfig = {}
}: ProductEditModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    category: '',
    price: '',
    initialStock: '',
    initialStockDate: getDefaultInitialStockDate(),
    minStock: '',
    description: ''
  });

  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [warnings, setWarnings] = useState<any[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset form when product changes
  useEffect(() => {
    if (product) {
      const config = stockConfig[product.id] || {};
      setFormData({
        name: product.name,
        category: product.category,
        price: product.price.toString(),
        initialStock: (config.initialStock || product.initialStock || 0).toString(),
        initialStockDate: config.initialStockDate || product.initialStockDate || getDefaultInitialStockDate(),
        minStock: (config.minStock || product.minStock || 5).toString(),
        description: product.description || ''
      });
    } else {
      setFormData({
        name: '',
        category: '',
        price: '',
        initialStock: '',
        initialStockDate: getDefaultInitialStockDate(),
        minStock: '',
        description: ''
      });
    }
    setErrors({});
    setWarnings([]);
  }, [product, isOpen]);

  // Validate the date format
  const validateDate = (dateString: string): boolean => {
    if (!dateString) return false;
    const date = parseISO(dateString);
    return isValid(date);
  };
  
  // Clear success message after 3 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  // Clear error message after 5 seconds
  useEffect(() => {
    if (saveError) {
      const timer = setTimeout(() => {
        setSaveError(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [saveError]);

  // Validate stock configuration when relevant fields change
  useEffect(() => {
    if (product && allSales.length > 0) {
      const tempProduct: Product = {
        ...product,
        initialStock: parseInt(formData.initialStock) || 0,
        initialStockDate: formData.initialStockDate,
        minStock: parseInt(formData.minStock) || 5
      };
      
      const stockWarnings = validateStockConfiguration(tempProduct, allSales);
      setWarnings(stockWarnings);
    }
  }, [formData.initialStock, formData.initialStockDate, product, allSales]);

  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    /* if (!formData.name.trim()) {
      newErrors.name = 'Le nom du produit est requis';
    }

    if (!formData.category.trim()) {
      newErrors.category = 'La catégorie est requise';
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price < 0) {
      newErrors.price = 'Le prix doit être un nombre positif';
    }
    */
    const initialStock = parseInt(formData.initialStock);
    if (isNaN(initialStock) || initialStock < 0) {
      newErrors.initialStock = 'Le stock initial doit être un nombre positif';
    }

    // Validate date format
    if (!validateDate(formData.initialStockDate)) {
      newErrors.initialStockDate = 'Format de date invalide (utilisez YYYY-MM-DD)';
    }

    const minStock = parseInt(formData.minStock);
    if (isNaN(minStock) || minStock < 0) {
      newErrors.minStock = 'Le stock minimum doit être un nombre positif';
    }

    if (!formData.initialStockDate) {
      newErrors.initialStockDate = 'La date de stock initial est requise';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    // Clear the product sales cache to ensure fresh calculations
    setSaveError(null);
    clearProductSalesCache();
    
    try {
      const parsedProduct: Product = {
        ...product!,
        name: product!.name,
        category: product!.category,
        price: product!.price,
        initialStock: parseInt(formData.initialStock),
        initialStockDate: formData.initialStockDate,
        minStock: parseInt(formData.minStock),
      };

      // Calculate the final stock using the new logic
      console.log('🧮 Calculating stock with new configuration:', {
        productName: parsedProduct.name,
        initialStock: parsedProduct.initialStock,
        effectiveDate: parsedProduct.initialStockDate,
        minStock: parsedProduct.minStock
      });
      
      const calculation = calculateStockFinal(parsedProduct, allSales, false);
      
      console.log('📊 Stock calculation result:', {
        finalStock: calculation.finalStock,
        validSales: calculation.validSales.length,
        ignoredSales: calculation.ignoredSales.length,
        hasInconsistentStock: calculation.hasInconsistentStock,
        warningMessage: calculation.warningMessage
      });

      const productData: Partial<Product> = {
        initialStock: parsedProduct.initialStock,
        initialStockDate: parsedProduct.initialStockDate,
        minStock: parsedProduct.minStock,
        stock: calculation.finalStock,
        isConfigured: true,
        quantitySold: calculation.validSales.reduce((sum, sale) => sum + sale.quantity, 0)
      };

      console.log('🔄 Saving product data:', productData);
      
      await onSave(productData);
      // Always consider it successful if no error was thrown
      setSaveSuccess(true);
      // Show success message for 3 seconds then close modal
      setTimeout(() => {
        onClose();
      }, 3000);
    } catch (error: any) {
      console.error('Error saving product:', error);
      setSaveError(`Erreur lors de la sauvegarde: ${error.message || 'Erreur inconnue'}`);
    }
  };

  const handleDeleteProduct = async () => {
    if (!product || !onDeleteProduct) return;
    
    setIsDeleting(true);
    try {
      console.log('🗑️ Deleting product:', product.id);
      await onDeleteProduct(product.id);
      onClose();
    } catch (error: any) {
      console.error('Error deleting product:', error);
      setSaveError(`Erreur lors de la suppression: ${error.message || 'Erreur inconnue'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!isOpen) return null;

  const isEditMode = !!product;

  return (
    <AnimatePresence>
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
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {isEditMode ? 'Configuration du Stock' : 'Ajouter un Produit'}
                </h3>
                <p className="text-gray-400 text-sm">
                  {isEditMode ? `Configuration pour: ${product.name}` : 'Créer un nouveau produit'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6 flex items-center space-x-3"
              >
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400">Configuration du stock sauvegardée avec succès</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error Message */}
          <AnimatePresence>
            {saveError && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center space-x-3"
              >
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <span className="text-red-400">{saveError}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stock Configuration Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h5 className="text-blue-400 font-semibold">Logique de Calcul avec Date d'Effet</h5>
                <div className="text-gray-300 text-sm mt-2 space-y-1">
                  <p>📦 <strong>Stock Initial:</strong> Quantité de départ définie manuellement</p>
                  <p>📅 <strong>Date d'Effet:</strong> À partir de cette date, les ventes sont déduites du stock</p>
                  <p>🧮 <strong>Calcul:</strong> Stock Final = Stock Initial - Ventes (à partir de la date d'effet)</p>
                  <p className="text-blue-400 mt-2">
                    💡 <strong>Exemple:</strong> Stock initial 100, Date d'effet 01/07/2025<br/>
                    • Vente 29/06/2025: 3 unités → Ignorée ⏭️<br/>
                    • Vente 01/07/2025: 10 unités → Comptée ✅<br/>
                    • Vente 03/07/2025: 5 unités → Comptée ✅<br/>
                    • <strong>Stock final = 100 - (10 + 5) = 85</strong>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2 mb-6">
              {warnings.map((warning, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-xl border flex items-start space-x-3 ${
                    warning.severity === 'error' 
                      ? 'bg-red-500/10 border-red-500/20'
                      : warning.severity === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                    warning.severity === 'error' 
                      ? 'text-red-400'
                      : warning.severity === 'warning'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`} />
                  <span className={`text-sm ${
                    warning.severity === 'error' 
                      ? 'text-red-300'
                      : warning.severity === 'warning'
                      ? 'text-yellow-300'
                      : 'text-blue-300'
                  }`}>
                    {warning.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div className="space-y-6">
            {/* Product Name and Category */}
            {isEditMode ? (
              <div className="bg-gray-700/30 rounded-xl p-4 mb-4">
                <h4 className="text-white font-medium mb-2">Informations Produit</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Produit</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {product?.name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Catégorie</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {product?.category}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Prix Moyen</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(product?.price || 0)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Package className="w-4 h-4 inline mr-2" />
                  Nom du Produit
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.name ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="Nom du produit"
                />
                {errors.name && (
                  <p className="text-red-400 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Tag className="w-4 h-4 inline mr-2" />
                  Catégorie
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.category ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="Catégorie du produit"
                />
                {errors.category && (
                  <p className="text-red-400 text-sm mt-1">{errors.category}</p>
                )}
              </div>
              </div>
            )}

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Prix Unitaire (€)
              </label>
              {isEditMode ? <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(product?.price || 0)}
              </div> : <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                             errors.price ? 'border-red-500' : 'border-gray-600'
                           }`}
                placeholder="0.00"
              />
              }{errors.price && (
                <p className="text-red-400 text-sm mt-1">{errors.price}</p>
              )}
            </div>

            {/* Stock Configuration */}
            <div className="bg-gray-700/30 rounded-xl p-4 space-y-4">
              <h4 className="text-white font-medium flex items-center space-x-2">
                <Hash className="w-4 h-4" />
                <span>Configuration du Stock avec Date d'Effet</span>
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    📦 Stock Initial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialStock}
                    onChange={(e) => handleInputChange('initialStock', e.target.value)}
                    className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                 errors.initialStock ? 'border-red-500' : 'border-gray-600'
                               }`}
                    placeholder="0"
                  />
                  {errors.initialStock && (
                    <p className="text-red-400 text-sm mt-1">{errors.initialStock}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">
                    Quantité de départ avant déduction des ventes
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    📅 Date d'Effet du Stock
                  </label>
                  <input
                    type="date"
                    value={formData.initialStockDate}
                    onChange={(e) => handleInputChange('initialStockDate', e.target.value)}
                    className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                 errors.initialStockDate ? 'border-red-500' : 'border-gray-600'
                               }`}
                    min="2020-01-01" 
                    max={format(new Date(new Date().setFullYear(new Date().getFullYear() + 5)), 'yyyy-MM-dd')}
                  />
                  {errors.initialStockDate && (
                    <p className="text-red-400 text-sm mt-1">{errors.initialStockDate}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1 space-y-1 bg-gray-700/30 p-2 rounded-lg">
                    <span className="block">🗓️ Les ventes <strong>à partir de cette date (incluse)</strong> seront déduites du stock initial.</span>
                    <span className="block">⏭️ Les ventes <strong>avant cette date</strong> seront ignorées dans le calcul.</span>
                    <span className="block text-blue-400">
                      💡 Exemple: Date d'effet = 01/07/2025 → Seules les ventes du 01/07/2025 et après sont comptées.
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  ⚠️ Stock Minimum (Alerte)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => handleInputChange('minStock', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.minStock ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="5"
                />
                {errors.minStock && (
                  <p className="text-red-400 text-sm mt-1">{errors.minStock}</p>
                )}
                <p className="text-gray-500 text-xs mt-1">
                  Seuil d'alerte pour stock faible
                </p>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Description (optionnel)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Description du produit..."
              />
            </div>
          </div>

          {/* Delete Product Option (Edit mode only) */}
          {isEditMode && onDeleteProduct && (
            <div className="mt-6">
              <div className="border-t border-gray-700 pt-6">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center space-x-2 bg-red-500/20 text-red-400 
                             py-3 px-4 rounded-xl hover:bg-red-500/30 transition-all duration-200"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Supprimer ce produit</span>
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 mt-8">
            <button
              onClick={handleSave}
              disabled={isLoading || saveSuccess}
              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold 
                         py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Sauvegarde...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Sauvegardé</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{isEditMode ? 'Sauvegarder la Configuration' : 'Créer le produit'}</span>
                </>
              )}
            </button>
            
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                         hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
            >
              Annuler
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
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
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Attention :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• La suppression de <strong>{product?.name}</strong> est définitive et irréversible</div>
                  <div>• Toutes les ventes associées à ce produit resteront dans l'historique mais seront orphelines</div>
                  <div>• Les statistiques, rapports et analyses seront impactés</div>
                  <div>• Cette action ne peut pas être annulée</div>
                  <div className="mt-2 pt-2 border-t border-red-500/20 text-red-300 font-medium">
                    Êtes-vous absolument sûr de vouloir supprimer ce produit ?
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleDeleteProduct}
                  disabled={isDeleting}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isDeleting ? (
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
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
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
    </AnimatePresence>
  );
}

        setSaveSuccess(true);
        // Show success message for 3 seconds then close modal
        setTimeout(() => {
          onClose();
        }, 3000);
      }
    } catch (error) {
      console.error('Error saving product:', error.message);
      setSaveError(`Erreur lors de la sauvegarde: ${error.message}`);
    }
  };

  const handleDeleteProduct = async () => {
    if (!product || !onDeleteProduct) return;
    
    setIsDeleting(true);
    try {
      console.log('🗑️ Deleting product:', product.id);
      await onDeleteProduct(product.id);
      onClose();
    } catch (error) {
      console.error('Error deleting product:', error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  if (!isOpen) return null;

  const isEditMode = !!product;

  return (
    <AnimatePresence>
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
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Package className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {isEditMode ? 'Modifier le Produit' : 'Ajouter un Produit'}
                </h3>
                <p className="text-gray-400 text-sm">
                  {isEditMode ? `ID: ${product.id}` : 'Créer un nouveau produit'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isLoading}
              className="text-gray-400 hover:text-white transition-colors duration-200"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Success Message */}
          <AnimatePresence>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-green-500/20 border border-green-500/30 rounded-xl p-4 mb-6 flex items-center space-x-3"
              >
                <CheckCircle className="w-5 h-5 text-green-400" />
                <span className="text-green-400">Configuration du stock sauvegardée avec succès</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Stock Configuration Info */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start space-x-3">
              <Info className="w-5 h-5 text-blue-400 mt-0.5" />
              <div>
                <h5 className="text-blue-400 font-semibold">Gestion du Stock Initial</h5>
                <p className="text-gray-300 text-sm mt-1">
                  La <strong>date d'effet</strong> détermine à partir de quand les ventes affectent le stock.
                  <br />
                  Les ventes antérieures à cette date seront ignorées dans le calcul du stock final.
                </p>
              </div>
            </div>
          </div>

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-2 mb-6">
              {warnings.map((warning, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-xl border flex items-start space-x-3 ${
                    warning.severity === 'error' 
                      ? 'bg-red-500/10 border-red-500/20'
                      : warning.severity === 'warning'
                      ? 'bg-yellow-500/10 border-yellow-500/20'
                      : 'bg-blue-500/10 border-blue-500/20'
                  }`}
                >
                  <AlertTriangle className={`w-4 h-4 mt-0.5 ${
                    warning.severity === 'error' 
                      ? 'text-red-400'
                      : warning.severity === 'warning'
                      ? 'text-yellow-400'
                      : 'text-blue-400'
                  }`} />
                  <span className={`text-sm ${
                    warning.severity === 'error' 
                      ? 'text-red-300'
                      : warning.severity === 'warning'
                      ? 'text-yellow-300'
                      : 'text-blue-300'
                  }`}>
                    {warning.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Form */}
          <div className="space-y-6">
            {/* Product Name and Category */}
            {isEditMode ? (
              <div className="bg-gray-700/30 rounded-xl p-4 mb-4">
                <h4 className="text-white font-medium mb-2">Informations Produit</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Produit</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {product?.name}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Catégorie</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {product?.category}
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1">Prix Moyen</label>
                    <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(product?.price || 0)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Package className="w-4 h-4 inline mr-2" />
                  Nom du Produit
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.name ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="Nom du produit"
                />
                {errors.name && (
                  <p className="text-red-400 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  <Tag className="w-4 h-4 inline mr-2" />
                  Catégorie
                </label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.category ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="Catégorie du produit"
                />
                {errors.category && (
                  <p className="text-red-400 text-sm mt-1">{errors.category}</p>
                )}
              </div>
              </div>
            )}

            {/* Price */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Prix Unitaire (€)
              </label>
              {isEditMode ? <div className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white">
                {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(product?.price || 0)}
              </div> : <input
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => handleInputChange('price', e.target.value)}
                className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                             errors.price ? 'border-red-500' : 'border-gray-600'
                           }`}
                placeholder="0.00"
              />
              }{errors.price && (
                <p className="text-red-400 text-sm mt-1">{errors.price}</p>
              )}
            </div>

            {/* Stock Configuration */}
            <div className="bg-gray-700/30 rounded-xl p-4 space-y-4">
              <h4 className="text-white font-medium flex items-center space-x-2">
                <Hash className="w-4 h-4" />
                <span>Configuration du Stock</span>
              </h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    Stock Initial
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.initialStock}
                    onChange={(e) => handleInputChange('initialStock', e.target.value)}
                    className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                 errors.initialStock ? 'border-red-500' : 'border-gray-600'
                               }`}
                    placeholder="0"
                  />
                  {errors.initialStock && (
                    <p className="text-red-400 text-sm mt-1">{errors.initialStock}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">
                    <Calendar className="w-4 h-4 inline mr-2" />
                    Date d'Effet du Stock
                    <span className="text-xs text-blue-400 ml-2">(Format: YYYY-MM-DD)</span>
                  </label>
                  <input
                    type="date"
                    value={formData.initialStockDate}
                    onChange={(e) => handleInputChange('initialStockDate', e.target.value)}
                    className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                               focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                                 errors.initialStockDate ? 'border-red-500' : 'border-gray-600'
                               }`}
                    min="2020-01-01" 
                    max={format(new Date(new Date().setFullYear(new Date().getFullYear() + 5)), 'yyyy-MM-dd')}
                  />
                  {errors.initialStockDate && (
                    <p className="text-red-400 text-sm mt-1">{errors.initialStockDate}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1 space-y-1 bg-gray-700/30 p-2 rounded-lg">
                    <span className="block">🗓️ Les ventes <strong>à partir de cette date (incluse)</strong> seront déduites du stock initial.</span>
                    <span className="block">⏭️ Les ventes <strong>avant cette date</strong> seront ignorées dans le calcul.</span>
                    <span className="block text-blue-400">
                      💡 Exemple: Date d'effet = 01/07/2025 → Seules les ventes du 01/07/2025 et après sont comptées.
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-2">
                  Stock Minimum (Alerte)
                </label>
                <input
                  type="number"
                  min="0"
                  value={formData.minStock}
                  onChange={(e) => handleInputChange('minStock', e.target.value)}
                  className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                             focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                               errors.minStock ? 'border-red-500' : 'border-gray-600'
                             }`}
                  placeholder="5"
                />
                {errors.minStock && (
                  <p className="text-red-400 text-sm mt-1">{errors.minStock}</p>
                )}
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Description (optionnel)
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder="Description du produit..."
              />
            </div>
          </div>

          {/* Delete Product Option (Edit mode only) */}
          {isEditMode && onDeleteProduct && (
            <div className="mt-6">
              <div className="border-t border-gray-700 pt-6">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center space-x-2 bg-red-500/20 text-red-400 
                             py-3 px-4 rounded-xl hover:bg-red-500/30 transition-all duration-200"
                >
                  <Trash2 className="w-5 h-5" />
                  <span>Supprimer ce produit</span>
                </button>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 mt-8">
            <button
              onClick={handleSave}
              disabled={isLoading || saveSuccess}
              className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white font-semibold 
                         py-3 px-4 rounded-xl hover:from-blue-600 hover:to-blue-700 
                         disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200 flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Sauvegarde...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle className="w-5 h-5" />
                  <span>Sauvegardé</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>{isEditMode ? 'Sauvegarder les modifications' : 'Créer le produit'}</span>
                </>
              )}
            </button>
            
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-6 py-3 bg-gray-600 text-white font-semibold rounded-xl 
                         hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed
                         transition-all duration-200"
            >
              Annuler
            </button>
          </div>
        </motion.div>
      </motion.div>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
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
              className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md"
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Confirmer la suppression</h3>
                  <p className="text-gray-400 text-sm">Cette action est irréversible</p>
                </div>
              </div>

              <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6">
                <h4 className="text-red-400 font-semibold mb-2">Attention :</h4>
                <div className="text-gray-300 text-sm space-y-1">
                  <div>• La suppression de <strong>{product?.name}</strong> est définitive et irréversible</div>
                  <div>• Toutes les ventes associées à ce produit resteront dans l'historique mais seront orphelines</div>
                  <div>• Les statistiques, rapports et analyses seront impactés</div>
                  <div>• Cette action ne peut pas être annulée</div>
                  <div className="mt-2 pt-2 border-t border-red-500/20 text-red-300 font-medium">
                    Êtes-vous absolument sûr de vouloir supprimer ce produit ?
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={handleDeleteProduct}
                  disabled={isDeleting}
                  className="flex-1 bg-gradient-to-r from-red-500 to-red-600 text-white font-semibold 
                             py-3 px-4 rounded-xl hover:from-red-600 hover:to-red-700 
                             disabled:opacity-50 disabled:cursor-not-allowed
                             transition-all duration-200 flex items-center justify-center space-x-2"
                >
                  {isDeleting ? (
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
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
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

        {/* Error Message */}
        <AnimatePresence>
          {saveError && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-500/20 border border-red-500/30 rounded-xl p-4 mb-6 flex items-center space-x-3"
            >
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <span className="text-red-400">{saveError}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </AnimatePresence>
    </AnimatePresence>
  );
}