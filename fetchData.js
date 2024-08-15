const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Import the FISH_DATA constant from fish_info_data.js
const { FISH_INFO } = require("./src/data/fish_info_data.js");

const saveIconToFile = async (iconUrl, savePath) => {
  try {
    const response = await axios.get(iconUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(savePath, response.data);
    console.log(`Saved icon to ${savePath}`);
  } catch (error) {
    console.error(
      `Failed to save icon from ${iconUrl} to ${savePath}:`,
      error.message
    );
  }
};

const downloadFishIcons = async () => {
  const iconsDir = path.join(__dirname, "public", "icons");

  // Ensure the directory exists
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
  }

  for (const fish of FISH_INFO) {
    const iconUrl = `https://xivapi.com/item/${fish.id}`;
    const savePath = path.join(iconsDir, `${fish.id}.png`);

    try {
      const { data } = await axios.get(iconUrl);
      const iconPath = `https://xivapi.com${data.IconHD}`;
      await saveIconToFile(iconPath, savePath);
    } catch (error) {
      console.error(
        `Failed to fetch data for fish ID ${fish.id}:`,
        error.message
      );
    }
  }
};

downloadFishIcons();
