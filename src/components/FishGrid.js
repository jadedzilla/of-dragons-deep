import React, { useState, useEffect } from 'react';
import FISH_DATA from '../data/fish_info_data';
import './FishGrid.css';
import Cookies from 'js-cookie';

const COOKIE_NAME = 'checkedFish';
const ITEMS_PER_PAGE = 100;

const FishGrid = () => {
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
  const [fishIcons, setFishIcons] = useState({});

  // Fetch fish icons from XIVAPI
  useEffect(() => {
    const fetchIcons = async () => {
      const icons = {};
      for (const fish of FISH_DATA) {
        try {
          const response = await fetch(`https://xivapi.com/item/${fish.id}`);
          const data = await response.json();
          icons[fish.id] = data.IconHD;
        } catch (error) {
          console.error('Error fetching icon for fish ID', fish.id, error);
        }
      }
      setFishIcons(icons);
    };

    fetchIcons();
  }, []);

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

  // Sort fish data alphabetically by name_en
  const sortedFishData = [...FISH_DATA].sort((a, b) => a.name_en.localeCompare(b.name_en));

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
    <div className="fish-grid-container">
      <div className="controls">
        <button onClick={handleExport}>Export Checked Fish</button>
        <button onClick={() => { setIsModalOpen(true); setModalMode('import'); }}>Import Checked Fish</button>
        <button onClick={handleClearCheckedFish}>Clear Checked Fish</button>
      </div>
      <div className="fish-grid">
        {paginatedFishData.map((fish) => (
          <div
            key={fish.id}
            className={`fish-item ${checkedFish.has(fish.id) ? 'checked' : ''}`}
            onClick={() => handleClick(fish.id)}
          >
            <div className="fish-icon">
              <img title={fish.name_en} src={`https://xivapi.com${fishIcons[fish.id]}`} alt={fish.name_en} />
            </div>
            {checkedFish.has(fish.id) && <span className="checkmark">&#10003;</span>}
          </div>
        ))}
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

export default FishGrid;
