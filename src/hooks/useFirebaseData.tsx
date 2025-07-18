importation { État d'utilisation, useEffect, utiliserCallback } de 'réagir';
importation { 
 collection, 
 ajouterDoc, 
 mettre à jourDoc, 
 supprimerDoc, 
 doc, 
 getDocs, 
 interroger, 
 commandantPar, 
 écoleBatch,
 getDoc,
 setDoc,
 où,
 limite
} de 'firebase/firestore';
importation { Erreur Base de feu } de 'firebase/application';
importation { db } de '../lib/firebase';
importation { COLLECTIONS } de '../lib/firebase';
importation { S'inscrireVente, Produit, Alerter, Statistiques du tableau de bord } de '../types';
importation { format, parseISO } de 'date-fns';

export fonction utiliserFirebaseData() {
  const [registreVentes, définirRegisterSales] = État d'utilisation<S'inscrireVente[]>([]);
  const [produits, setProduit] = État d'utilisation<Produire[]>([]);
  const [alertes, définirAlertes] = État d'utilisation<Alerteur[]>([]);
  const [statistiques du tableau de bord, définir les statistiques du tableau de bord] = État d'utilisation<Statistiques du tableau de bord>({
 total des vents : 0,
 totalRevenu : 0,
 totalProduits : 0,
 registres actifs : 0,
 Produits en stock de fabrication : 0, 
 meilleurs produits : [],
 ventiles recentes: []
 });
 const [charge, setLoading] = état d'utilisation(vrai);

  // Chargeur les données initiales
  const données initiales de chargement = utiliserCallback(async () => {
    setLoading(vrai);
    essayer {
      const [données de vente, produitsDonnées] = assister Promesse.tous([
        chargeurInscriptionVentes(),
        chargeurProduit(),
        loadAlerts()
      ]);
      
      // Calculateur les statistiques du tableau de bord après le chargement des données
      const statistiques = calculateur les statistiques du tableau de bord(données de vente, produitsDonnées);
      définir les statistiques du tableau de bord(statistiques);
      
      // Mettre à jour les produits avec les données de vente pour plus de cohérence
      mettre à jour les produits avec les données de vente(produitsDonnées, données de vente);
    } attrapeur (erreur) {
      console.erreur(« Erreur lors du chargement des données initiales : », erreur);
    } enfin {
      setLoading(faux);
    }
  }, []);

  // Chargeur les alertes depuis Firestore
  const loadAlerts = async () => {
    essayer {
      const alertesRequête = interroger(
        collection(db, 'alertes'),
        commandantPar('crééAt', 'desc')
      );
      const alertsSnapshot = await getDocs(alertsQuery);
      const alertsData = alertsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date()
      })) as Alert[];
      
      setAlerts(alertsData);
      return alertsData;
    } catch (error) {
      console.error('Error loading alerts:', error);
      // Return empty array if alerts collection doesn't exist yet
      setAlerts([]);
      return [];
    }
  };

  // Calculate dashboard statistics
  const calculateDashboardStats = useCallback((salesData: RegisterSale[], productsData: Product[]): DashboardStats => {
    // Calculate total quantity sold
    const totalSales = salesData.length;
    
    // Calculate total revenue (using sale.total which is the actual revenue)
    const totalRevenue = salesData.reduce((sum, sale) => sum + sale.total, 0);
    
    // Count low stock products
    const lowStockProducts = productsData.filter(product => 
      product.stock <= product.minStock && product.isConfigured
    ).length;

    // Calculate top products by quantity sold
    const productSales = new Map<string, { name: string, quantity: number, revenue: number }>();
    salesData.forEach(sale => {
      const key = sale.product;
      if (productSales.has(key)) {
        const existing = productSales.get(key)!;
        existing.quantity += sale.quantity;
        existing.revenue += sale.total; // Use total directly for accurate revenue
      } else {
        productSales.set(key, {
          name: sale.product,
          quantity: sale.quantity,
          revenue: sale.total
        });
      }
    });

    const topProducts = Array.from(productSales.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5);

    // Get recent sales (last 10)
    const recentSales = salesData.slice(0, 10);

    // Return the calculated stats instead of setting state directly
    return {
      totalSales,
      totalRevenue,
      totalProducts: productsData.length,
      lowStockProducts,
      topProducts,
      recentSales
    };
  }, []);

  // Update products with sales data for consistency
  const updateProductsWithSalesData = useCallback((productsData: Product[], salesData: RegisterSale[]) => {
    // Create a map to track sales by product
    const productSalesMap = new Map<string, {
      quantitySold: number;
      lastSale: Date | null;
      revenue: number;
    }>();
    
    // Process all sales to calculate per-product metrics
    salesData.forEach(sale => {
      const key = `${sale.product}-${sale.category}`;
      
      if (!productSalesMap.has(key)) {
        productSalesMap.set(key, {
          quantitySold: 0,
          lastSale: null,
          revenue: 0
        });
      }
      
      const productStats = productSalesMap.get(key)!;
      productStats.quantitySold += sale.quantity;
      productStats.revenue += sale.total;
      
      // Update last sale date if this sale is more recent
      if (!productStats.lastSale || sale.date > productStats.lastSale) {
        productStats.lastSale = sale.date;
      }
    });
    
    // Update products with the calculated sales data
    const updatedProducts = productsData.map(product => {
      const key = `${product.name}-${product.category}`;
      const salesStats = productSalesMap.get(key);
      
      if (salesStats) {
        // Calculate stock based on initial stock and sales
        const initialStock = product.initialStock || 0;
        const quantitySold = salesStats.quantitySold;
        const stock = Math.max(0, initialStock - quantitySold);
        
        return {
          ...product,
          quantitySold,
          stock,
          lastSale: salesStats.lastSale,
          stockValue: stock * product.price
        };
      }
      
      return product;
    });
    
    setProducts(updatedProducts);
  }, []);

  // Load register sales from Firestore
  const loadRegisterSales = async () => {
    try {
      console.log(`🔄 Loading register sales from Firestore collection: ${COLLECTIONS.REGISTER_SALES}...`);
      // Query only non-archived sales
      const salesQuery = query(collection(db, COLLECTIONS.REGISTER_SALES), orderBy('date', 'desc'));
      const salesSnapshot = await getDocs(salesQuery);
      console.log(`📊 Found ${salesSnapshot.docs.length} sales records`);
      
      // Process sales data with proper date conversion
      const salesData = salesSnapshot.docs.map(doc => {
        const data = doc.data();
        let date: Date;
        
        // Handle different date formats
        if (data.date) {
          if (typeof data.date === 'string') {
            // If it's a string (ISO format or similar)
            date = new Date(data.date);
          } else if (data.date.toDate && typeof data.date.toDate === 'function') {
            // If it's a Firestore Timestamp
            date = data.date.toDate();
          } else {
            // Fallback
            date = new Date();
            console.warn(`⚠️ Unknown date format for sale ${doc.id}, using current date as fallback`);
          }
        } else {
          date = new Date();
          console.warn(`⚠️ Missing date for sale ${doc.id}, using current date as fallback`);
        }
        
        return {
          id: doc.id,
          ...data,
          date,
          // Ensure total is calculated correctly if not present
          total: data.total || (data.price * data.quantity)
        } as RegisterSale;
      });
      
      console.log(`✅ Successfully loaded ${salesData.length} sales`);
      setRegisterSales(salesData);
      console.log(`Sales data set to state: ${salesData.length} items`);
      return salesData;
    } catch (error) {
      console.error('❌ Error loading register sales:', error);
      
      // More detailed error analysis
      if (error.code) {
        console.error(`Firebase error code: ${error.code}`);
      }
      
      if (error.name === 'FirebaseError') {
        console.error('This is a Firebase-specific error');
      }
      
      return [];
    }
  };

  // Load products from Firestore
  const loadProducts = async () => {
    try {
      console.log('🔄 Loading products from Firestore...');
      const productsQuery = query(
        collection(db, 'products'),
        orderBy('name', 'asc')
      );
      const productsSnapshot = await getDocs(productsQuery);
      const productsData = productsSnapshot.docs.map(doc => {
        const data = doc.data();
        console.log(`📦 Loaded product: ${data.name}, initialStock: ${data.initialStock}, initialStockDate: ${data.initialStockDate}, stock: ${data.stock}`);
        return {
          id: doc.id,
          ...data,
          lastSale: data.lastSale?.toDate() || null,
          initialStockDate: data.initialStockDate || format(new Date(), 'yyyy-MM-dd')
        };
      }) as Product[];
      
      console.log(`✅ Loaded ${productsData.length} products`);
      setProducts(productsData);
      return productsData;
    } catch (error) {
      console.error('❌ Error loading products:', error.message, error.stack);
      return [];
    }
  };

  // Extract products from sales data
  const extractProductsFromSales = useCallback((sales: RegisterSale[]) => {
    const productMap = new Map<string, Product>();
    const productSales = new Map<string, {
      quantitySold: number;
      lastSale: Date | null;
      revenue: number;
    }>();
    
    console.log(`🔍 Extracting products from ${sales.length} sales records...`);
    
    sales.forEach(sale => {
      const key = `${sale.product}-${sale.category}`;
      
      // Track sales data per product
      if (!productSales.has(key)) {
        productSales.set(key, {
          quantitySold: 0,
          lastSale: null,
          revenue: 0
        });
      }
      
      const productStats = productSales.get(key)!;
      productStats.quantitySold += sale.quantity;
      productStats.revenue += sale.total;
      
      // Update last sale date if this sale is more recent
      if (!productStats.lastSale || sale.date > productStats.lastSale) {
        productStats.lastSale = sale.date;
      }
      
      if (productMap.has(key)) {
        const existing = productMap.get(key)!;
        existing.quantitySold = (existing.quantitySold || 0) + sale.quantity;
        
        // Calculate weighted average price
        const totalValue = existing.price * (existing.quantitySold - sale.quantity) + sale.price * sale.quantity;
        existing.price = totalValue / existing.quantitySold;
        
        // Update last sale date if more recent
        if (sale.date > (existing.lastSale || new Date(0))) {
          existing.lastSale = sale.date;
        }
      } else {
        // Create a new product entry
        const newProduct: Product = {
          id: `${sale.product}-${sale.category}`.replace(/[^a-zA-Z0-9]/g, '-'),
          name: sale.product,
          category: sale.category,
          price: sale.price,
          quantitySold: 0, // Will be updated later
          initialStock: 0, // Default to 0 for new products
          stock: 0, // Will be calculated later
          minStock: 5,
          stockValue: 0, // Will be calculated later
          lastSale: null, // Will be updated later
          isConfigured: false, // Mark as not configured by default
          initialStockDate: format(new Date(), 'yyyy-MM-dd')
        };
        productMap.set(key, newProduct);
      }
    });
    
    // Update stock values based on total sold
    const products = Array.from(productMap.values());
    console.log(`📦 Extracted ${products.length} unique products from sales`);
    
    // Update products with sales data
    return products.map(product => {
      const key = `${product.name}-${product.category}`;
      const stats = productSales.get(key);
      
      if (stats) {
        const estimatedInitialStock = Math.max(10, Math.ceil(stats.quantitySold * 1.5));
        
        return {
          ...product,
          quantitySold: stats.quantitySold,
          initialStock: product.isConfigured ? product.initialStock : estimatedInitialStock,
          stock: product.isConfigured 
            ? Math.max(0, product.initialStock - stats.quantitySold)
            : Math.max(0, estimatedInitialStock - stats.quantitySold),
          lastSale: stats.lastSale,
          stockValue: product.isConfigured
            ? Math.max(0, product.initialStock - stats.quantitySold) * product.price
            : Math.max(0, estimatedInitialStock - stats.quantitySold) * product.price
        };
      }
      
      return product;
    });
  }, []);

  // Add register sales
  const addRegisterSales = async (sales: Omit<RegisterSale, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      
      sales.forEach(sale => {
        const docRef = doc(collection(db, 'register_sales'));
        batch.set(docRef, {
          ...sale,
          date: sale.date instanceof Date ? sale.date : new Date(sale.date)
        });
      });
      
      await batch.commit();
      await loadInitialData();
    } catch (error) {
      console.error('Error adding register sales:', error);
      throw error;
    }
  };

  // Add single register sale
  const addRegisterSale = async (sale: Omit<RegisterSale, 'id'>) => {
    try {
      await addDoc(collection(db, 'register_sales'), {
        ...sale,
        date: sale.date instanceof Date ? sale.date : new Date(sale.date)
      });
      await loadInitialData();
    } catch (error) {
      console.error('Error adding register sale:', error);
      throw error;
    }
  };

  // Update register sale
  const updateRegisterSale = async (id: string, updates: Partial<RegisterSale>) => {
    try {
      console.log(`🔄 Attempting to update sale with ID: ${id}`);
      console.log(`📝 Updates to apply:`, updates);
      
      // Validate the ID
      if (!id || typeof id !== 'string' || id.trim().length === 0) {
        console.error('❌ Invalid sale ID provided:', id);
        throw new Error('ID de vente invalide');
      }
      
      const trimmedId = id.trim();
      console.log(`🔍 Using trimmed ID: ${trimmedId}`);
      
      // First, check if the document exists
      const saleRef = doc(db, COLLECTIONS.REGISTER_SALES, trimmedId);
      const saleDoc = await getDoc(saleRef);
      
      if (!saleDoc.exists()) {
        console.warn(`⚠️ Sale document ${trimmedId} not found in Firestore`);
        return false;
      }
      
      console.log(`✅ Sale document ${trimmedId} found, proceeding with update`);
      const currentData = saleDoc.data();
      console.log(`📊 Current sale data:`, currentData);
      
      // Prepare the update data
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      // Handle date conversion properly
      if (updates.date) {
        updateData.date = updates.date instanceof Date ? updates.date : new Date(updates.date);
        console.log(`📅 Date update: ${updateData.date.toISOString()}`);
      }
      
      console.log(`📝 Final update data:`, updateData);
      
      // Perform the update
      await updateDoc(saleRef, updateData);
      console.log(`✅ Sale ${trimmedId} updated successfully`);
      
      // Reload data to reflect changes
      await loadInitialData();
      console.log(`🔄 Data reloaded after update`);
      return true;
    } catch (error) {
      console.error(`❌ Error updating sale ${id}:`, error);
      
      if (error instanceof FirebaseError && error.code === 'not-found') {
        console.warn(`⚠️ Sale document ${id} not found (Firebase error), it may have been deleted`);
        return false;
      } else if (error instanceof FirebaseError && error.code === 'permission-denied') {
        console.error(`🔒 Permission denied when updating sale ${id}. Check Firestore security rules.`);
        throw new Error('Permissions insuffisantes pour modifier cette vente');
      } else if (error instanceof FirebaseError && error.code === 'unavailable') {
        console.error(`🌐 Firestore unavailable when updating sale ${id}. Check internet connection.`);
        throw new Error('Service indisponible. Vérifiez votre connexion internet.');
      }
      
      throw error;
    }
  };

  // Delete register sale
  const deleteRegisterSale = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'register_sales', id));
      await loadInitialData();
    } catch (error) {
      console.error('Error deleting register sale:', error);
      throw error;
    }
  };

  // Delete multiple register sales
  const deleteRegisterSales = async (ids: string[]) => {
    try {
      console.log(`🗑️ Starting archival process for ${ids.length} sales...`);
      console.log(`📋 Sale IDs to archive:`, ids);
      
      // Validate all IDs first
      const validIds = ids.filter(id => id && typeof id === 'string' && id.trim().length > 0);
      if (validIds.length !== ids.length) {
        console.warn(`⚠️ Found ${ids.length - validIds.length} invalid IDs, proceeding with ${validIds.length} valid IDs`);
      }
      
      if (validIds.length === 0) {
        console.error('❌ No valid sale IDs provided for archiving');
        return {
          success: false,
          successCount: 0,
          notFoundCount: 0,
          errorCount: 0,
          errors: ['No valid sale IDs provided for archiving']
        };
      }
      
      // Process each sale individually for better error handling
      let successCount = 0;
      let notFoundCount = 0;
      let otherErrorCount = 0;
      const errors: string[] = [];
      
      for (const id of validIds) {
        try {
          const trimmedId = id.trim();
          console.log(`🔄 Processing sale: ${trimmedId}`);
          
          // Get the original sale document
          const saleRef = doc(db, COLLECTIONS.REGISTER_SALES, trimmedId);
          const saleDoc = await getDoc(saleRef);
          
          if (!saleDoc.exists()) {
            console.warn(`⚠️ Sale ${trimmedId} not found, skipping`);
            notFoundCount++;
            continue;
          }
          
          const saleData = saleDoc.data();
          console.log(`📊 Found sale data for ${trimmedId}:`, saleData);
          
          // Create archive document
          const archiveRef = doc(collection(db, COLLECTIONS.ARCHIVED_SALES));
          const archiveData = {
            ...saleData,
            original_id: trimmedId,
            archived_at: new Date().toISOString(),
            archived_by: 'user',
            archive_reason: 'user_deleted',
            archive_note: 'Archived through sales management interface'
          };
          
          console.log(`📝 Creating archive document: ${archiveRef.id}`);
          await setDoc(archiveRef, archiveData);
          console.log(`✅ Archive document created: ${archiveRef.id}`);
          
          // Delete original document
          console.log(`🗑️ Deleting original sale: ${trimmedId}`);
          await deleteDoc(saleRef);
          console.log(`✅ Original sale deleted: ${trimmedId}`);
          
          successCount++;
          
        } catch (saleError) {
          console.error(`❌ Error archiving sale ${id}:`, saleError);
          otherErrorCount++;
          errors.push(`${id}: ${saleError.message}`);
          
          // Continue with next sale instead of failing completely
          continue;
        }
      }
      
      console.log(`📊 Archiving summary: ${successCount} successful, ${notFoundCount} not found, ${otherErrorCount} other errors`);
      
      if (errors.length > 0) {
        console.error('❌ Archiving errors:', errors);
      }
      
      // Reload data if any sales were successfully archived
      if (successCount > 0) {
        console.log(`🔄 Reloading data after archiving ${successCount} sales...`);
        await loadInitialData();
        console.log(`✅ Data reloaded successfully`);
      }
      
      // Return detailed result
      return {
        success: successCount > 0 || (successCount === 0 && notFoundCount > 0 && otherErrorCount === 0),
        successCount,
        notFoundCount,
        errorCount: otherErrorCount,
        errors
      };
      
    } catch (error) {
      console.error('❌ Fatal error during sales archiving:', error);
      
      // Check for specific Firebase errors
      if (error.code === 'permission-denied') {
        console.error('🔒 Permission denied. Check Firestore security rules.');
      } else if (error.code === 'not-found') {
        console.error('📂 Collection or document not found.');
      } else if (error.code === 'unavailable') {
        console.error('🌐 Firestore service unavailable. Check internet connection.');
      }
      
      return {
        success: false,
        successCount: 0,
        notFoundCount: 0,
        errorCount: 1,
        errors: [error.message || 'Fatal error during archiving']
      };
    }
  };

  // Add a function to manually create the archived_sales collection
  const createArchivedSalesCollection = async () => {
    try {
      console.log('🔄 Creating archived_sales collection...');
        
      // Create a temporary document to ensure the collection exists
      const tempRef = doc(collection(db, COLLECTIONS.ARCHIVED_SALES), 'temp_init');
      await setDoc(tempRef, {
        created_at: new Date().toISOString(),
        purpose: 'Initialize archived_sales collection',
        note: 'This document will be deleted after collection creation'
      });
      
      console.log('✅ Temporary document created in archived_sales');
      
      // Immediately delete the temporary document
      await deleteDoc(tempRef);
      console.log('✅ Temporary document deleted, collection now exists');
      
      // Verify the collection exists
      const verifySnapshot = await getDocs(query(collection(db, COLLECTIONS.ARCHIVED_SALES), limit(1)));
      console.log(`✅ Verified archived_sales collection exists`);
      
      return true;
    } catch (error) {
      console.error('❌ Error creating archived_sales collection:', error);
      return false;
    }
  };

  // Add product
  const addProduct = async (product: Omit<Product, 'id'>) => {
    try {
      await addDoc(collection(db, 'products'), product);
      await loadProducts();
    } catch (error) {
      console.error('Error adding product:', error);
      throw error;
    }
  };

  // Add multiple products
  const addProducts = async (products: Omit<Product, 'id'>[]) => {
    try {
      const batch = writeBatch(db);
      products.forEach(product => {
        const docRef = doc(collection(db, 'products'));
        batch.set(docRef, product);
      });
      await batch.commit();
      await loadProducts();
    } catch (error) {
      console.error('Error adding products:', error);
      throw error;
    }
  };

  // Update product
  const updateProduct = async (id: string, updates: Partial<Product>) => {
    try {
      console.log('Updating product:', id, updates);
      const productRef = doc(db, 'products', id);
      
      // Get current product data
      const productDoc = await getDoc(productRef);
      if (!productDoc.exists()) {
        console.error('Product not found');
        return false;
      }
      
      // Merge with updates
      const updatedProduct = {
        ...productDoc.data(),
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      // Save to Firestore
      await updateDoc(productRef, updatedProduct);
      console.log('Product updated successfully');
      
      // Don't reload all products, let the component handle the update
      return true;
    } catch (error) {
      console.error('Error updating product:', error);
      return false;
    }
  };

  // Delete product
  const deleteProduct = async (id: string) => {
    try {
      console.log('Deleting product:', id);
      
      // Get product data before deletion (for logging)
      const productRef = doc(db, 'products', id);
      const productDoc = await getDoc(productRef);
      if (!productDoc.exists()) {
        console.error('Product not found');
        return false;
      }
      
      const productData = productDoc.data();
      console.log('Product to delete:', productData);
      
      // Create a deletion log
      await addDoc(collection(db, 'product_deletions'), {
        productId: id,
        productName: productData.name,
        productCategory: productData.category,
        deletedAt: new Date().toISOString(),
        productData: productData
      });
      
      // Delete the product
      await deleteDoc(doc(db, 'products', id));
      console.log('Product deleted successfully');
      
      await loadProducts();
    } catch (error) {
      console.error('Error deleting product:', error);
      throw error;
    }
  };

  // Delete multiple products
  const deleteProducts = async (ids: string[]) => {
    try {
      const batch = writeBatch(db);
      ids.forEach(id => {
        batch.delete(doc(db, 'products', id));
      });
      await batch.commit();
      await loadProducts();
    } catch (error) {
      console.error('Error deleting products:', error);
      throw error;
    }
  };

  // Auto sync products from sales
  const autoSyncProductsFromSales = async (): Promise<boolean> => {
    try {
      console.log('🔄 Starting auto sync of products from sales...');
      const sales = await loadRegisterSales();
      
      // Get existing products first
      const existingProducts = await loadProducts();
      const existingProductMap = new Map<string, Product>();
      existingProducts.forEach(product => {
        const key = `${product.name}-${product.category}`;
        existingProductMap.set(key, product);
      });
      console.log(`📊 Found ${existingProducts.length} existing products`);
      
      // Extract products from sales
      const extractedProducts = extractProductsFromSales(sales);
      console.log(`🔍 Extracted ${extractedProducts.length} products from sales`);
      
      // Prepare batch update
      const batch = writeBatch(db);
      
      let updatedCount = 0;
      let newCount = 0;
      
      // Process each extracted product
      extractedProducts.forEach(extractedProduct => {
        const key = `${extractedProduct.name}-${extractedProduct.category}`;
        const existingProduct = existingProductMap.get(key);
        
        // If product exists, update only sales-related fields
        if (existingProduct) {
          const docRef = doc(db, 'products', existingProduct.id);
          
          // Preserve existing configuration
          const updates = {
            quantitySold: extractedProduct.quantitySold,
            lastSale: extractedProduct.lastSale,
            // Only update stock if not manually configured
            ...(!existingProduct.isConfigured ? {
              stock: extractedProduct.stock,
              stockValue: extractedProduct.stockValue
            } : {})
          };
          
          batch.update(docRef, updates);
          updatedCount++;
        } else {
          // Create new product
          const docRef = doc(collection(db, 'products'));
          
          // For new products, set stock to 0 by default
          const newProduct = {
            ...extractedProduct,
            id: docRef.id, // Use Firestore generated ID
            stock: 0, // Default to 0 stock for new products
            initialStock: 0,
            stockValue: 0,
            isConfigured: false // Mark as not configured
          };
          
          batch.set(docRef, {
            ...newProduct
          });
          newCount++;
        }
      });
      
      console.log(`🔄 Updating ${updatedCount} existing products and creating ${newCount} new products`);
      
      // Commit all changes
      await batch.commit();
      await loadProducts();
      
      // Recalculate dashboard stats
      const updatedSales = await loadRegisterSales();
      const updatedProducts = await loadProducts();
      const stats = calculateDashboardStats(updatedSales, updatedProducts);
      setDashboardStats(stats);
      
      console.log('✅ Auto sync completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Error syncing products from sales:', error);
      return false;
    }
  };

  // Update stock configuration
  const updateStockConfig = async (productId: string, config: { initialStock: number, initialStockDate: string, minStock: number }) => {
    try {
      console.log('🔄 Updating stock configuration for product:', productId);
      console.log('📦 Initial stock:', config.initialStock);
      console.log('📅 Effective date:', config.initialStockDate);
      console.log('⚠️ Min stock:', config.minStock);
      
      // Get the product document
      const productRef = doc(db, 'products', productId);
      const productDoc = await getDoc(productRef);
      
      if (productDoc.exists()) {
        const productData = productDoc.data() as Product;
        console.log('📦 Current product data:', JSON.stringify(productData, null, 2));
        
        // Get all sales for this product to calculate accurate stock
        const salesQuery = query(collection(db, 'register_sales'));
        const salesSnapshot = await getDocs(salesQuery);
        console.log(`📊 Found ${salesSnapshot.docs.length} total sales`);
        
        // Filter sales for this specific product
        const productSales = salesSnapshot.docs.filter(doc => {
          const saleData = doc.data();
          return saleData.product === productData.name && 
                 saleData.category === productData.category;
        });
        
        console.log(`📊 Found ${productSales.length} sales for product "${productData.name}" in category "${productData.category}"`);
        
        // Parse the effective date and set to start of day
        const effectiveDate = new Date(config.initialStockDate);
        const effectiveDateStart = startOfDay(effectiveDate);
        console.log(`📅 Effective date (start of day): ${effectiveDateStart.toISOString()}`);
        
        let quantitySold = 0;
        let salesAfterEffectiveDate = 0;
        let debugSales = [];
        
        productSales.forEach((doc) => {
          const saleData = doc.data();
          const saleId = doc.id;
          
          // Convert sale date to a consistent format
          let saleDate: Date;
          if (typeof saleData.date === 'string') {
            saleDate = new Date(saleData.date);
          } else if (saleData.date && typeof saleData.date.toDate === 'function') {
            saleDate = saleData.date.toDate();
          } else {
            saleDate = new Date();
            console.warn(`⚠️ Invalid date format for sale ${saleId}`);
          }
          
          // Normalize sale date to start of day for comparison
          const saleDateStart = startOfDay(saleDate);
          
          const debugInfo = {
            id: saleId,
            product: saleData.product,
            category: saleData.category,
            date: saleDateStart.toISOString(),
            quantity: saleData.quantity || 0,
            included: saleDateStart >= effectiveDateStart || isSameDay(saleDateStart, effectiveDateStart)
          };
          debugSales.push(debugInfo);
          
          // Compare dates properly (start of day comparison)
          const saleTime = saleDateStart.getTime();
          const effectiveTime = effectiveDateStart.getTime();
          
          // Include sales on or after the effective date
          if (saleTime >= effectiveTime || isSameDay(saleDateStart, effectiveDateStart)) {
            const quantity = saleData.quantity || 0;
            quantitySold += quantity;
            salesAfterEffectiveDate++;
            console.log(`✅ Including sale from ${format(saleDateStart, 'yyyy-MM-dd')} with quantity ${quantity}`);
          } else {
            console.log(`⏭️ Skipping sale from ${format(saleDateStart, 'yyyy-MM-dd')} (before effective date: ${format(effectiveDateStart, 'yyyy-MM-dd')})`);
          }
        });
        
        // Log detailed debug info
        console.log('🔍 Sales analysis summary:');
        debugSales.forEach(sale => {
          console.log(`  ${sale.included ? '✅' : '❌'} ${sale.date.split('T')[0]} - ${sale.quantity} units`);
        });
        console.log(`🧮 Total quantity sold on/after ${format(effectiveDateStart, 'yyyy-MM-dd')}: ${quantitySold} units (from ${salesAfterEffectiveDate} sales)`);
        
        // Calculate current stock based on initial stock and sales
        const stock = Math.max(0, config.initialStock - quantitySold);
        console.log(`📊 Final stock calculation for ${productData.name}: ${config.initialStock} - ${quantitySold} = ${stock}`);
        
        const updatedProduct = {
          initialStock: config.initialStock,
          initialStockDate: config.initialStockDate,
          minStock: config.minStock,
          quantitySold: quantitySold,
          stock: stock,
          stockValue: Math.round((stock * productData.price) * 100) / 100, // Round to 2 decimal places
          isConfigured: true,
          lastUpdated: new Date().toISOString(),
          calculationDetails: {
            effectiveDate: config.initialStockDate,
            salesIncluded: salesAfterEffectiveDate,
            salesIgnored: productSales.length - salesAfterEffectiveDate,
            quantitySoldAfterEffectiveDate: quantitySold
          }
        };
        
        console.log('✅ Updating product with:', JSON.stringify(updatedProduct, null, 2));
        await updateDoc(productRef, updatedProduct);
        console.log('✅ Stock configuration updated successfully');
        
        // Reload products to reflect changes
        await loadProducts();
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Error updating stock config:', error.message, error.stack);
      return false;
    }
  };

  // Mark alert as read
  const markAlertAsRead = async (alertId: string) => {
    try {
      const alertRef = doc(db, 'alerts', alertId);
      await updateDoc(alertRef, { read: true });
      await loadAlerts();
    } catch (error) {
      console.error('Error marking alert as read:', error);
      throw error;
    }
  };

  // Update sale (alias for updateRegisterSale)
  const updateSale = updateRegisterSale;

  // Delete sales (alias for deleteRegisterSales)
  const deleteSales = deleteRegisterSales;

  // Categorize sales (placeholder function)
  const categorizeSales = async (saleIds: string[], category: string, subcategory?: string) => {
    try {
      console.log(`🏷️ Starting categorization of ${saleIds.length} sales...`);
      
      // First, verify which documents exist
      const existingDocs = [];
      const notFoundIds = [];
      
      for (const id of saleIds) {
        try {
          const saleRef = doc(db, 'register_sales', id);
          const saleDoc = await getDoc(saleRef);
          
          if (saleDoc.exists()) {
            existingDocs.push({ id, ref: saleRef });
          } else {
            notFoundIds.push(id);
            console.warn(`⚠️ Sale ${id} not found, skipping categorization`);
          }
        } catch (error) {
          console.error(`❌ Error checking sale ${id}:`, error);
          notFoundIds.push(id);
        }
      }
      
      console.log(`📊 Categorization check: ${existingDocs.length} found, ${notFoundIds.length} not found`);
      
      if (existingDocs.length === 0) {
        console.warn('⚠️ No existing sales found to categorize');
        return true; // Consider it successful if no sales to categorize
      }
      
      // Create batch update for existing documents only
      const batch = writeBatch(db);
      const categoryMetadata = {
        category,
        subcategory: subcategory || null,
        catégorisé_at: nouveau Date().toISOString(),
        catégorisé_par: 'utilisateur' // Pourrait être amélioré pour utiliser les informations réelles de l'utilisateur
      };
      
      documents existant.pourChacun(({ ref }) => {
        lot.update(ref, { 
          catégorie,
          catégorie_métadonnées: catégorieMétadonnées
        });
      });
      
      assistant lot.commettre();
      console.log(`✅ Catégorisé avec succès ${documents existants.longueur} vents`);
      
      assistant données initiales de chargement();
      retour vrai;
    } attrapeur (erreur) {
      console.erreur(« Erreur lors de la catégorisation des venties : », erreur);
      lancier erreur;
    }
  };

  // Actualiser les données
  const actualiser les données = utiliserCallback(() => {
    console.log('🔄 Actualisation manuel de toutes les données...');
    retour données initiales de chargement();
  }, [données initiales de chargement]);

  // Chargeur les données lors du montage
  useEffect(() => {
    données initiales de chargement();
  }, [données initiales de chargement]);

  retour {
    registreVentes,
    produits,
    statistiques du tableau de bord,
    alertes,
    chargement,
    ajouterRegisterVentes,
    ajouterInscriptionVente,
    mise à journalInscriptionVente,
    mise à jourVente,
    supprimerInscriptionVente,
    supprimerInscriptionVentes,
    supprimerVentes,
    catégoriserVentes,
    ajouterProduire,
    ajouterProduire,
    mettre à jour le produit,
    supprimerProduire,
    supprimerProduire,
    markAlertAsRead,
    actualiser les données,
    autoSyncProduitsFromSales,
    updateStockConfig,
    supprimerProduire sélectionnés: supprimerProduire,
    setLoading
  };
            }