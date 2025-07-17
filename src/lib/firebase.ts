import { initializeApp } from 'firebase/app';
import { getFirestore, collection, doc, getDocs, query, limit, setDoc, deleteDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyArF2HQYsikpctyr_B38MJyDQhtOznP9iI",
  authDomain: "suiviventes-v3-moderne.firebaseapp.com",
  projectId: "suiviventes-v3-moderne",
  storageBucket: "suiviventes-v3-moderne.firebasestorage.app",
  messagingSenderId: "570814845718",
  appId: "1:570814845718:web:0b5225abca8bf440947637"
  measurementId: "G-Q548YQ9MMJ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const analytics = getAnalytics(app);


// Configure auth settings for production
auth.useDeviceLanguage(); // Use device language for auth UI
auth.settings.appVerificationDisabledForTesting = false; // Enable app verification

export default app;

// Firestore collection names
export const COLLECTIONS = {
  REGISTER_SALES: 'register_sales',
  ARCHIVED_SALES: 'archived_sales', // Collection for archived sales - MAKE SURE THIS EXISTS IN FIREBASE
  PRODUCTS: 'products',
  USERS: 'users',
  ALERTS: 'alerts',
  SETTINGS: 'settings'
} as const;

// Verify collections exist
export async function verifyCollections() {
  try {
    console.log('🔍 Verifying Firestore collections...');
    
    // Check each collection
    for (const [name, path] of Object.entries(COLLECTIONS)) {
      try {
        const collRef = collection(db, path);
        console.log(`🔍 Verifying collection: ${path}...`);
        
        const snapshot = await getDocs(query(collRef, limit(1)));
        console.log(`✅ Collection ${path} verified (${snapshot.docs.length} docs found)`);
        
      } catch (error) {
        console.warn(`⚠️ Collection ${path} may not exist yet, will be created when first document is added`);
        
        // Note: Firestore collections are created automatically when first document is added
        // No need to pre-create them
      }
    }
    
    console.log('✅ Collection verification complete');
    return true;
  } catch (error) {
    console.error('❌ Error during collection verification:', error);
    return false;
  }
}
// Firestore data types
export interface FirestoreRegisterSale {
  id: string;
  product: string;
  category: string;
  register: string;
  date: string; // ISO string
  seller: string;
  quantity: number;
  price: number;
  total: number;
  createdAt: string; // ISO string
  // ✅ NEW: Categorization metadata field
  category_metadata?: {
    category: string;
    subcategory?: string | null;
    categorized_at: string;
    categorized_by: string;
  };
}

export interface FirestoreArchivedSale extends FirestoreRegisterSale {
  original_id: string;
  archived_at: string;
  archived_by: string;
  archive_reason: 'user_deleted' | 'system_deleted' | 'duplicate' | 'error_correction' | 'other';
  archive_note?: string;
}

export interface FirestoreProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number; // Final quantity
  initialStock?: number; // Initial quantity from stock import
  initialStockDate?: string; // Effective date for initial stock (YYYY-MM-DD)
  quantitySold?: number; // Quantity sold from sales import
  minStock: number;
  description?: string;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface FirestoreUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'seller' | 'viewer';
  createdAt: string; // ISO string
  lastLogin?: string; // ISO string
}

export interface FirestoreAlert {
  id: string;
  type: 'low-stock' | 'high-sales' | 'system' | 'duplicate';
  message: string;
  severity: 'info' | 'warning' | 'error';
  timestamp: string; // ISO string
  read: boolean;
  userId?: string;
}

// Environment configuration
export const ENV_CONFIG = {
  isDevelopment: true,
  isProduction: false,
  apiUrl: 'https://beausejour-f5d88.firebaseapp.com',
  enableAnalytics: true,
  enablePerformanceMonitoring: true,
  logLevel: 'error' // Only log errors in production
};

// Security configuration for production
export const SECURITY_CONFIG = {
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  maxLoginAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  requireEmailVerification: true,
  enableTwoFactorAuth: false, // Can be enabled later
  passwordMinLength: 8,
  passwordRequireSpecialChars: true
};

// Performance configuration
export const PERFORMANCE_CONFIG = {
  enableOfflineSupport: true,
  cacheSizeBytes: 40 * 1024 * 1024, // 40MB
  enablePersistence: true,
  syncSettings: {
    cacheSizeBytes: 40 * 1024 * 1024
  }
};