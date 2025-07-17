import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, 
  Save, 
  RefreshCw, 
  Edit, 
  Calendar, 
  User, 
  Package, 
  DollarSign,
  Hash,
  Monitor,
  Tag,
  CheckCircle,
  AlertTriangle,
  Info,
  Users,
  Clock
} from 'lucide-react';
import { RegisterSale } from '../types';
import { format } from 'date-fns';

interface SalesBulkEditModalProps {
  selectedSales: RegisterSale[];
  selectedCount: number;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updates: Partial<RegisterSale>) => Promise<void>;
  isLoading: boolean;
  existingSales?: RegisterSale[];
}

interface EditableFields {
  product?: string;
  category?: string;
  register?: string;
  date?: string;
  time?: string;
  seller?: string;
  quantity?: string;
  price?: string;
  total?: string;
}

export function SalesBulkEditModal({ 
  selectedSales,
  selectedCount, 
  isOpen, 
  onClose, 
  onSave, 
  isLoading,
  existingSales = []
}: SalesBulkEditModalProps) {
  const [editMode, setEditMode] = useState<'bulk' | 'individual'>('bulk');
  const [currentSaleIndex, setCurrentSaleIndex] = useState(0);
  const [bulkUpdates, setBulkUpdates] = useState<EditableFields>({});
  const [individualUpdates, setIndividualUpdates] = useState<Map<string, EditableFields>>(new Map());
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);

  // Extract unique values from existing sales for suggestions
  const uniqueValues = React.useMemo(() => {
    const registers = [...new Set(existingSales.map(s => s.register))];
    const sellers = [...new Set(existingSales.map(s => s.seller))];
    const categories = [...new Set(existingSales.map(s => s.category))];
    const products = [...new Set(existingSales.map(s => s.product))];
    
    return { registers, sellers, categories, products };
  }, [existingSales]);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setBulkUpdates({});
      setIndividualUpdates(new Map());
      setErrors({});
      setHasChanges(false);
      setCurrentSaleIndex(0);
      setPreviewMode(false);
    }
  }, [isOpen]);

  // Check for changes
  useEffect(() => {
    const hasBulkChanges = Object.keys(bulkUpdates).some(key => 
      bulkUpdates[key as keyof EditableFields] !== undefined && 
      bulkUpdates[key as keyof EditableFields] !== ''
    );
    
    const hasIndividualChanges = individualUpdates.size > 0 && 
      Array.from(individualUpdates.values()).some(updates => 
        Object.keys(updates).some(key => 
          updates[key as keyof EditableFields] !== undefined && 
          updates[key as keyof EditableFields] !== ''
        )
      );
    
    setHasChanges(hasBulkChanges || hasIndividualChanges);
  }, [bulkUpdates, individualUpdates]);

  const validateField = (field: string, value: string): string | null => {
    switch (field) {
      case 'quantity':
        const quantity = parseFloat(value);
        if (isNaN(quantity) || quantity <= 0) {
          return 'La quantité doit être un nombre positif';
        }
        break;
      case 'price':
      case 'total':
        const amount = parseFloat(value);
        if (isNaN(amount)) {
          return 'Le montant doit être un nombre valide';
        }
        break;
      case 'date':
        if (!value) {
          return 'La date est requise';
        }
        break;
      case 'time':
        if (!value) {
          return 'L\'heure est requise';
        }
        break;
      case 'product':
      case 'category':
      case 'seller':
        if (!value.trim()) {
          return 'Ce champ est requis';
        }
        break;
    }
    return null;
  };

  const validateAllFields = (): boolean => {
    const newErrors: { [key: string]: string } = {};
    
    if (editMode === 'bulk') {
      Object.entries(bulkUpdates).forEach(([field, value]) => {
        if (value !== undefined && value !== '') {
          const error = validateField(field, value);
          if (error) {
            newErrors[field] = error;
          }
        }
      });
    } else {
      individualUpdates.forEach((updates, saleId) => {
        Object.entries(updates).forEach(([field, value]) => {
          if (value !== undefined && value !== '') {
            const error = validateField(field, value);
            if (error) {
              newErrors[`${saleId}-${field}`] = error;
            }
          }
        });
      });
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleBulkFieldChange = (field: keyof EditableFields, value: string) => {
    setBulkUpdates(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-calculate total when quantity or price changes
    if (field === 'quantity' || field === 'price') {
      const quantity = field === 'quantity' ? parseFloat(value) : parseFloat(bulkUpdates.quantity || '0');
      const price = field === 'price' ? parseFloat(value) : parseFloat(bulkUpdates.price || '0');
      
      if (!isNaN(quantity) && !isNaN(price)) {
        const total = quantity * price;
        setBulkUpdates(prev => ({ ...prev, total: total.toFixed(2) }));
      }
    }
  };

  const handleIndividualFieldChange = (saleId: string, field: keyof EditableFields, value: string) => {
    setIndividualUpdates(prev => {
      const newMap = new Map(prev);
      const saleUpdates = newMap.get(saleId) || {};
      newMap.set(saleId, { ...saleUpdates, [field]: value });
      return newMap;
    });
    
    // Clear error when user starts typing
    const errorKey = `${saleId}-${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }

    // Auto-calculate total when quantity or price changes
    if (field === 'quantity' || field === 'price') {
      const currentUpdates = individualUpdates.get(saleId) || {};
      const quantity = field === 'quantity' ? parseFloat(value) : parseFloat(currentUpdates.quantity || '0');
      const price = field === 'price' ? parseFloat(value) : parseFloat(currentUpdates.price || '0');
      
      if (!isNaN(quantity) && !isNaN(price)) {
        const total = quantity * price;
        setIndividualUpdates(prev => {
          const newMap = new Map(prev);
          const saleUpdates = newMap.get(saleId) || {};
          newMap.set(saleId, { ...saleUpdates, total: total.toFixed(2) });
          return newMap;
        });
      }
    }
  };

  const getCurrentSale = () => selectedSales[currentSaleIndex];
  const getCurrentUpdates = () => individualUpdates.get(getCurrentSale()?.id) || {};

  const navigateToSale = (direction: 'prev' | 'next') => {
    if (direction === 'prev' && currentSaleIndex > 0) {
      setCurrentSaleIndex(currentSaleIndex - 1);
    } else if (direction === 'next' && currentSaleIndex < selectedSales.length - 1) {
      setCurrentSaleIndex(currentSaleIndex + 1);
    }
  };

  const handleSave = async () => {
    if (!validateAllFields()) return;

    const updates: Partial<RegisterSale> = {};
    
    if (editMode === 'bulk') {
      // Apply bulk updates
      Object.entries(bulkUpdates).forEach(([field, value]) => {
        if (value !== undefined && value !== '') {
          if (field === 'date' || field === 'time') {
            // Handle date/time combination
            const dateValue = bulkUpdates.date || format(new Date(), 'yyyy-MM-dd');
            const timeValue = bulkUpdates.time || '00:00';
            updates.date = new Date(`${dateValue}T${timeValue}`);
          } else if (field === 'quantity' || field === 'price' || field === 'total') {
            updates[field as keyof RegisterSale] = parseFloat(value);
          } else {
            updates[field as keyof RegisterSale] = value.trim();
          }
        }
      });
    } else {
      // For individual mode, we'll need to handle this differently
      // This is a simplified version - in practice, you'd need to update each sale individually
      const currentSale = getCurrentSale();
      const currentUpdates = getCurrentUpdates();
      
      Object.entries(currentUpdates).forEach(([field, value]) => {
        if (value !== undefined && value !== '') {
          if (field === 'date' || field === 'time') {
            const dateValue = currentUpdates.date || format(currentSale.date, 'yyyy-MM-dd');
            const timeValue = currentUpdates.time || format(currentSale.date, 'HH:mm');
            updates.date = new Date(`${dateValue}T${timeValue}`);
          } else if (field === 'quantity' || field === 'price' || field === 'total') {
            updates[field as keyof RegisterSale] = parseFloat(value);
          } else {
            updates[field as keyof RegisterSale] = value.trim();
          }
        }
      });
    }

    await onSave(updates);
  };

  const renderBulkEditForm = () => (
    <div className="space-y-6">
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
        <div className="flex items-start space-x-3">
          <Info className="w-5 h-5 text-blue-400 mt-0.5" />
          <div>
            <h5 className="text-blue-400 font-semibold">Modification en lot</h5>
            <p className="text-gray-300 text-sm mt-1">
              Les champs remplis seront appliqués à toutes les <strong>{selectedCount}</strong> ventes sélectionnées.
              Laissez vide les champs que vous ne souhaitez pas modifier.
            </p>
          </div>
        </div>
      </div>

      {/* Product and Category */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Package className="w-4 h-4 inline mr-2" />
            Produit
          </label>
          <input
            type="text"
            list="products-list"
            value={bulkUpdates.product || ''}
            onChange={(e) => handleBulkFieldChange('product', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.product ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <datalist id="products-list">
            {uniqueValues.products.map(product => (
              <option key={product} value={product} />
            ))}
          </datalist>
          {errors.product && (
            <p className="text-red-400 text-sm mt-1">{errors.product}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Tag className="w-4 h-4 inline mr-2" />
            Catégorie
          </label>
          <input
            type="text"
            list="categories-list"
            value={bulkUpdates.category || ''}
            onChange={(e) => handleBulkFieldChange('category', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.category ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <datalist id="categories-list">
            {uniqueValues.categories.map(category => (
              <option key={category} value={category} />
            ))}
          </datalist>
          {errors.category && (
            <p className="text-red-400 text-sm mt-1">{errors.category}</p>
          )}
        </div>
      </div>

      {/* Register and Seller */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Monitor className="w-4 h-4 inline mr-2" />
            Caisse
          </label>
          <select
            value={bulkUpdates.register || ''}
            onChange={(e) => handleBulkFieldChange('register', e.target.value)}
            className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="">Ne pas modifier</option>
            {uniqueValues.registers.map(register => (
              <option key={register} value={register}>{register}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <User className="w-4 h-4 inline mr-2" />
            Vendeur
          </label>
          <input
            type="text"
            list="sellers-list"
            value={bulkUpdates.seller || ''}
            onChange={(e) => handleBulkFieldChange('seller', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.seller ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Laisser vide pour ne pas modifier"
          />
          <datalist id="sellers-list">
            {uniqueValues.sellers.map(seller => (
              <option key={seller} value={seller} />
            ))}
          </datalist>
          {errors.seller && (
            <p className="text-red-400 text-sm mt-1">{errors.seller}</p>
          )}
        </div>
      </div>

      {/* Date and Time */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Calendar className="w-4 h-4 inline mr-2" />
            Date
          </label>
          <input
            type="date"
            value={bulkUpdates.date || ''}
            onChange={(e) => handleBulkFieldChange('date', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.date ? 'border-red-500' : 'border-gray-600'
                       }`}
          />
          {errors.date && (
            <p className="text-red-400 text-sm mt-1">{errors.date}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Clock className="w-4 h-4 inline mr-2" />
            Heure
          </label>
          <input
            type="time"
            value={bulkUpdates.time || ''}
            onChange={(e) => handleBulkFieldChange('time', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.time ? 'border-red-500' : 'border-gray-600'
                       }`}
          />
          {errors.time && (
            <p className="text-red-400 text-sm mt-1">{errors.time}</p>
          )}
        </div>
      </div>

      {/* Quantity, Price, and Total */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <Hash className="w-4 h-4 inline mr-2" />
            Quantité
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={bulkUpdates.quantity || ''}
            onChange={(e) => handleBulkFieldChange('quantity', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.quantity ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Ne pas modifier"
          />
          {errors.quantity && (
            <p className="text-red-400 text-sm mt-1">{errors.quantity}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            <DollarSign className="w-4 h-4 inline mr-2" />
            Prix Unitaire (€)
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            value={bulkUpdates.price || ''}
            onChange={(e) => handleBulkFieldChange('price', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.price ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Ne pas modifier"
          />
          {errors.price && (
            <p className="text-red-400 text-sm mt-1">{errors.price}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Total (€)
          </label>
          <input
            type="number"
            step="0.01"
            value={bulkUpdates.total || ''}
            onChange={(e) => handleBulkFieldChange('total', e.target.value)}
            className={`w-full px-4 py-3 bg-gray-700 border rounded-lg text-white
                       focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                         errors.total ? 'border-red-500' : 'border-gray-600'
                       }`}
            placeholder="Calculé automatiquement"
          />
          {errors.total && (
            <p className="text-red-400 text-sm mt-1">{errors.total}</p>
          )}
        </div>
      </div>
    </div>
  );

  const renderIndividualEditForm = () => {
    const currentSale = getCurrentSale();
    const currentUpdates = getCurrentUpdates();
    
    if (!currentSale) return null;

    return (
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between bg-gray-700/30 rounded-xl p-4">
          <div>
            <h4 className="text-white font-medium">
              Vente {currentSaleIndex + 1} sur {selectedSales.length}
            </h4>
            <p className="text-gray-400 text-sm">ID: {currentSale.id}</p>
          </div>
          
          <div className="flex space-x-2">
            <button
              onClick={() => navigateToSale('prev')}
              disabled={currentSaleIndex === 0}
              className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Précédent
            </button>
            <button
              onClick={() => navigateToSale('next')}
              disabled={currentSaleIndex === selectedSales.length - 1}
              className="px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-500 
                         disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              Suivant
            </button>
          </div>
        </div>

        {/* Current Values Display */}
        <div className="bg-gray-700/20 rounded-xl p-4">
          <h5 className="text-gray-400 font-medium mb-3">Valeurs actuelles :</h5>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div>
              <span className="text-gray-500">Produit:</span>
              <p className="text-white font-medium">{currentSale.product}</p>
            </div>
            <div>
              <span className="text-gray-500">Catégorie:</span>
              <p className="text-white font-medium">{currentSale.category}</p>
            </div>
            <div>
              <span className="text-gray-500">Caisse:</span>
              <p className="text-white font-medium">{currentSale.register}</p>
            </div>
            <div>
              <span className="text-gray-500">Vendeur:</span>
              <p className="text-white font-medium">{currentSale.seller}</p>
            </div>
            <div>
              <span className="text-gray-500">Date:</span>
              <p className="text-white font-medium">{format(currentSale.date, 'dd/MM/yyyy HH:mm')}</p>
            </div>
            <div>
              <span className="text-gray-500">Quantité:</span>
              <p className="text-white font-medium">{currentSale.quantity}</p>
            </div>
            <div>
              <span className="text-gray-500">Prix:</span>
              <p className="text-white font-medium">{currentSale.price.toFixed(2)}€</p>
            </div>
            <div>
              <span className="text-gray-500">Total:</span>
              <p className="text-white font-medium">{currentSale.total.toFixed(2)}€</p>
            </div>
          </div>
        </div>

        {/* Edit Form - Similar to bulk but for individual sale */}
        <div className="space-y-4">
          {/* Product and Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Package className="w-4 h-4 inline mr-2" />
                Nouveau Produit
              </label>
              <input
                type="text"
                list="products-list-individual"
                value={currentUpdates.product || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'product', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.product}
              />
              <datalist id="products-list-individual">
                {uniqueValues.products.map(product => (
                  <option key={product} value={product} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Tag className="w-4 h-4 inline mr-2" />
                Nouvelle Catégorie
              </label>
              <input
                type="text"
                list="categories-list-individual"
                value={currentUpdates.category || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'category', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.category}
              />
              <datalist id="categories-list-individual">
                {uniqueValues.categories.map(category => (
                  <option key={category} value={category} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Register and Seller */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Monitor className="w-4 h-4 inline mr-2" />
                Nouvelle Caisse
              </label>
              <select
                value={currentUpdates.register || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'register', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">Garder: {currentSale.register}</option>
                {uniqueValues.registers.map(register => (
                  <option key={register} value={register}>{register}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <User className="w-4 h-4 inline mr-2" />
                Nouveau Vendeur
              </label>
              <input
                type="text"
                list="sellers-list-individual"
                value={currentUpdates.seller || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'seller', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.seller}
              />
              <datalist id="sellers-list-individual">
                {uniqueValues.sellers.map(seller => (
                  <option key={seller} value={seller} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Date and Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Calendar className="w-4 h-4 inline mr-2" />
                Nouvelle Date
              </label>
              <input
                type="date"
                value={currentUpdates.date || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'date', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Clock className="w-4 h-4 inline mr-2" />
                Nouvelle Heure
              </label>
              <input
                type="time"
                value={currentUpdates.time || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'time', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {/* Quantity, Price, and Total */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <Hash className="w-4 h-4 inline mr-2" />
                Nouvelle Quantité
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={currentUpdates.quantity || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'quantity', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.quantity.toString()}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                <DollarSign className="w-4 h-4 inline mr-2" />
                Nouveau Prix (€)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={currentUpdates.price || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'price', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.price.toFixed(2)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-400 mb-2">
                Nouveau Total (€)
              </label>
              <input
                type="number"
                step="0.01"
                value={currentUpdates.total || ''}
                onChange={(e) => handleIndividualFieldChange(currentSale.id, 'total', e.target.value)}
                className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white
                           focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                placeholder={currentSale.total.toFixed(2)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!isOpen) return null;

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
          className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Edit className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Modifier les Ventes</h3>
                <p className="text-gray-400 text-sm">{selectedCount} vente(s) sélectionnée(s)</p>
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

          {/* Mode Toggle */}
          <div className="mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={() => setEditMode('bulk')}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  editMode === 'bulk'
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Users className="w-5 h-5" />
                  <span className="font-medium">Modification en Lot</span>
                </div>
                <p className="text-xs opacity-80">Appliquer les mêmes modifications à toutes les ventes</p>
              </button>

              <button
                onClick={() => setEditMode('individual')}
                className={`p-4 rounded-xl border transition-all duration-200 ${
                  editMode === 'individual'
                    ? 'bg-green-500/20 border-green-500/30 text-green-400'
                    : 'bg-gray-700/30 border-gray-600 text-gray-400 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center justify-center space-x-2 mb-2">
                  <Edit className="w-5 h-5" />
                  <span className="font-medium">Modification Individuelle</span>
                </div>
                <p className="text-xs opacity-80">Modifier chaque vente une par une</p>
              </button>
            </div>
          </div>

          {/* Form Content */}
          {editMode === 'bulk' ? renderBulkEditForm() : renderIndividualEditForm()}

          {/* Warning about changes */}
          {hasChanges && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-6 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4"
            >
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <h5 className="text-yellow-400 font-semibold">Modifications détectées</h5>
                  <p className="text-gray-300 text-sm mt-1">
                    {editMode === 'bulk' 
                      ? `Les modifications seront appliquées à toutes les ${selectedCount} ventes sélectionnées.`
                      : `Les modifications seront appliquées à la vente sélectionnée.`
                    }
                    Les statistiques et calculs de stock seront automatiquement mis à jour.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Actions */}
          <div className="flex space-x-3 mt-8">
            <button
              onClick={handleSave}
              disabled={isLoading || !hasChanges}
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
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>
                    {editMode === 'bulk' 
                      ? `Appliquer à ${selectedCount} ventes`
                      : 'Sauvegarder les modifications'
                    }
                  </span>
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
    </AnimatePresence>
  );
}