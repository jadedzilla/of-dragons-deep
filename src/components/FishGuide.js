import React, { useState, useEffect } from 'react';
import FISH_DATA from '../data/fish_info_data';
import './FishGuide.css';
import Cookies from 'js-cookie';

const COOKIE_NAME = 'checkedFish';
const ITEMS_PER_PAGE = 100;
const ITEMS_PER_ROW = 10;

const FishGuide = () => {
  // Load checked fish from cookies
  const getInitialCheckedFish = () => {
    const cookie = Cookies.get(COOKIE_NAME);
    return cookie ? new Set(JSON.parse(cookie)) : new Set();
  };

  const [checkedFish, setCheckedFish] = useState(getInitialCheckedFish);
  const [currentPage, setCurrentPage] = useState(1);
  const [exportString, setExportString] = useState('');
  const [importString, setImportString] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState(''); // 'export' or 'import'

  // Save checked fish to cookies whenever it changes
  useEffect(() => {
    Cookies.set(COOKIE_NAME, JSON.stringify([...checkedFish]), { expires: 365 });
  }, [checkedFish]);

  const handleClick = (fishId) => {
    setCheckedFish((prev) => {
      const newCheckedFish = new Set(prev);
      if (newCheckedFish.has(fishId)) {
        newCheckedFish.delete(fishId);
      } else {
        newCheckedFish.add(fishId);
      }
      return newCheckedFish;
    });
  };

  const handleClearCheckedFish = () => {
    setCheckedFish(new Set());
  };

  // Sort fish data by id
  const sortedFishData = [...FISH_DATA].sort((a, b) => a.id - b.id);

  // Calculate the start and end index for the current page
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;

  // Get the current page's fish data
  const paginatedFishData = sortedFishData.slice(startIndex, endIndex);

  // Export checked fish to a JSON string
  const handleExport = () => {
    const data = JSON.stringify([...checkedFish], null, 2);
    setExportString(data);
    setIsModalOpen(true);
    setModalMode('export');
  };

  // Import checked fish from a JSON string
  const handleImport = () => {
    try {
      const data = JSON.parse(importString);
      setCheckedFish(new Set(data));
      setImportString(''); // Clear the import string after successful import
    } catch (error) {
      alert('Failed to parse JSON string.');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setModalMode('');
  };

  // Handle pagination button click
  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  // Generate page numbers
  const totalPages = Math.ceil(sortedFishData.length / ITEMS_PER_PAGE);
  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="guide-container">
      <div className="controls">
        <button onClick={handleExport}>Export Checked Fish</button>
        <button onClick={() => { setIsModalOpen(true); setModalMode('import'); }}>Import Checked Fish</button>
        <button onClick={handleClearCheckedFish}>Clear Checked Fish</button>
      </div>
      <div className="pagination">
        {pageNumbers.map((number) => (
          <button
            key={number}
            className={`pagination-button ${currentPage === number ? 'active' : ''}`}
            onClick={() => handlePageChange(number)}
          >
            {number}
          </button>
        ))}
      </div>
      <table className="guide">
        <tbody>
          {Array.from({ length: 10 }, (_, rowIndex) => (
            <tr key={rowIndex}>
              {paginatedFishData.slice(rowIndex * ITEMS_PER_ROW, (rowIndex + 1) * ITEMS_PER_ROW).map((fish) => (
                <td
                  key={fish.id}
                  className={`icon ${checkedFish.has(fish.id) ? 'checked' : ''}`}
                  title={fish.name_en}
                  onClick={() => handleClick(fish.id)}
                >
                  <img src={`/icons/${fish.id}.png`} alt={fish.name_en} />
                  
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {isModalOpen && (
        <div className="modal">
          <div className="modal-content">
            <span className="close" onClick={closeModal}>&times;</span>
            {modalMode === 'export' && (
              <>
                <h2>Export Checked Fish</h2>
                <textarea
                  value={exportString}
                  readOnly
                  rows={10}
                  cols={50}
                  placeholder="Exported JSON string will appear here"
                />
              </>
            )}
            {modalMode === 'import' && (
              <>
                <h2>Import Checked Fish</h2>
                <textarea
                  value={importString}
                  onChange={(e) => setImportString(e.target.value)}
                  rows={10}
                  cols={50}
                  placeholder="Paste JSON string to import"
                />
                <button onClick={handleImport}>Import</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default FishGuide;