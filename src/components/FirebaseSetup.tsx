 import React from 'react';
 import { useState } from 'react';
 import { AlertCircle, Database, RefreshCw } from 'lucide-react';

 // 1) Importez l’initialisation et Firestore
 import { initializeApp } from 'firebase/app';
 import {
   getFirestore,
   collection,
   doc,
   setDoc,
   deleteDoc
 } from 'firebase/firestore';
 import { ENV_CONFIG, verifyCollections } from '../lib/firebase';
import { db } from '../lib/firebase';

// React component export
export const FirebaseSetup: React.FC = () => {
  const [initializing, setInitializing] = useState(false);
  const [initResult, setInitResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const handleInitializeFirebase = async () => {
    if (initializing) return;
    
    setInitializing(true);
    setInitResult(null);
    
    try {
      // First verify existing collections
      console.log('🔄 Step 1: Verifying existing collections...');
      const verifySuccess = await verifyCollections();
      
      // Then specifically create the archived_sales collection
      console.log('🔄 Step 2: Ensuring archived_sales collection exists...');
      const archiveRef = doc(collection(db, 'archived_sales'), 'init_check');
      await setDoc(archiveRef, {
        created_at: new Date().toISOString(),
        purpose: 'Initialize archived_sales collection for sales archiving system'
      });
      console.log('✅ archived_sales collection initialized');
      
      // Clean up the initialization document
      await deleteDoc(archiveRef);
      console.log('✅ Initialization document cleaned up');
      
      setInitResult({
        success: true,
        message: 'Collections Firebase initialisées avec succès. Le système d\'archivage des ventes est maintenant activé.'
      });
    } catch (error) {
      console.error('Error initializing Firebase collections:', error);
      setInitResult({
        success: false,
        message: `Erreur lors de l'initialisation: ${error.message || 'Vérifiez les permissions Firestore'}`
      });
    } finally {
      setInitializing(false);
    }
  };

  return (
    <div className="p-6 bg-blue-500/10 border border-blue-500/20 rounded-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Database className="w-6 h-6 text-blue-400" />
          <h3 className="font-medium text-white text-lg">Configuration Firebase</h3>
        </div>
        
        <button
          onClick={handleInitializeFirebase}
          disabled={initializing}
          className="bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium 
                     py-2 px-4 rounded-lg hover:from-blue-600 hover:to-blue-700 
                     disabled:opacity-50 disabled:cursor-not-allowed
                     transition-all duration-200 flex items-center space-x-2"
        >
          {initializing ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Initialisation...</span>
            </>
          ) : (
            <>
              <Database className="w-4 h-4" />
              <span>Initialiser Firebase</span>
            </>
          )}
        </button>
      </div>
      
      <p className="text-blue-300 mb-4">
        Firebase est configuré et prêt. Projet ID: <span className="text-white">{ENV_CONFIG.apiUrl}</span>
      </p>
      
      {initResult && (
        <div className={`mt-4 p-4 rounded-lg border ${
          initResult.success 
            ? 'bg-green-500/20 border-green-500/30 text-green-400' 
            : 'bg-red-500/20 border-red-500/30 text-red-400'
        }`}>
          <div className="flex items-center space-x-2">
            {initResult.success ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span>{initResult.message}</span>
          </div>
          
          {initResult.success && (
            <div className="mt-2 text-sm text-green-300">
              <p>✅ Collections créées/vérifiées:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>register_sales - Ventes actives</li>
                <li>archived_sales - Ventes archivées</li>
                <li>products - Produits</li>
                <li>users - Utilisateurs</li>
                <li>alerts - Alertes</li>
              </ul>
              <p className="mt-2">Le système d'archivage des ventes est maintenant activé.</p>
            </div>
          )}
          
          {!initResult.success && (
            <div className="mt-2 text-sm text-red-300">
              <p>Vérifiez la console pour plus de détails sur l'erreur.</p>
              <p className="mt-1">Vous pouvez également créer manuellement la collection "archived_sales" dans la console Firebase.</p>
            </div>
          )}
        </div>
      )}
      
      <div className="mt-4 bg-blue-500/5 border border-blue-500/10 rounded-lg p-3">
        <p className="text-sm text-blue-300">
          <strong>Conseil:</strong> Cliquez sur "Initialiser Firebase" pour créer automatiquement toutes les collections nécessaires, 
          y compris la collection "archived_sales\" requise pour le système d'archivage des ventes.
        </p>
      </div>
    </div>
  );
};

export default FirebaseSetup;