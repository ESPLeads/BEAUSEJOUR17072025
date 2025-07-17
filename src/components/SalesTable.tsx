import React from 'react';
import { motion } from 'framer-motion';

interface Sale {
  id: string;
  product: string;
}

interface SalesTableProps {
  sales: Sale[];
}

export const SalesTable: React.FC<SalesTableProps> = ({ sales }) => {
  // Detect and log duplicate IDs before rendering
  // This helps identify data integrity issues that could cause React key conflicts
  const idCounts = new Map<string, number>();
  const duplicateIds: string[] = [];
  
  sales.forEach((sale) => {
    const count = idCounts.get(sale.id) || 0;
    idCounts.set(sale.id, count + 1);
    
    if (count === 1) {
      // First time we see this ID as a duplicate
      duplicateIds.push(sale.id);
    }
  });
  
  if (duplicateIds.length > 0) {
    console.log('⚠️ Duplicate sale IDs detected:', duplicateIds);
    console.log('📊 ID frequency map:', Object.fromEntries(idCounts));
  } else {
    console.log('✅ All sale IDs are unique');
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-gray-300">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left">ID</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Product</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Index</th>
          </tr>
        </thead>
        <tbody>
          {sales.map((sale, index) => (
            // CRITICAL: Using sale.id + index ensures truly unique keys
            // React's Virtual DOM reconciliation relies on unique keys to:
            // 1. Efficiently update only changed elements
            // 2. Maintain component state during re-renders
            // 3. Preserve animations and focus states
            // 4. Avoid the "Encountered two children with the same key" warning
            //
            // Why sale.id alone isn't sufficient:
            // - Data sources may contain duplicate IDs due to import errors
            // - Database constraints might not prevent ID duplication
            // - API responses could include the same record multiple times
            //
            // Why sale.id + index works:
            // - Even if sale.id is duplicated, the index will always be unique
            // - Preserves the relationship between data and position
            // - Allows React to properly track each row's lifecycle
            // - Enables smooth animations when items are added/removed/reordered
            <motion.tr
              key={`${sale.id}-${index}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ 
                duration: 0.2, 
                delay: index * 0.05 // Stagger animation for visual appeal
              }}
              className="hover:bg-gray-50 transition-colors duration-200"
            >
              <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                {sale.id}
                {/* Visual indicator for duplicate IDs */}
                {duplicateIds.includes(sale.id) && (
                  <span className="ml-2 text-red-500 text-xs">⚠️ DUP</span>
                )}
              </td>
              <td className="border border-gray-300 px-4 py-2">
                {sale.product}
              </td>
              <td className="border border-gray-300 px-4 py-2 text-gray-500 text-sm">
                {index}
              </td>
            </motion.tr>
          ))}
        </tbody>
      </table>
      
      {/* Summary information */}
      <div className="mt-4 text-sm text-gray-600">
        <p>Total sales: {sales.length}</p>
        <p>Unique IDs: {idCounts.size}</p>
        {duplicateIds.length > 0 && (
          <p className="text-red-600">
            Duplicate IDs found: {duplicateIds.length} ({duplicateIds.join(', ')})
          </p>
        )}
      </div>
    </div>
  );
};

export default SalesTable;