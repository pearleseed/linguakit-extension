#!/bin/bash
# Auto-navigate to the project root directory (one level up from this script's directory)
cd "$(dirname "$0")/.."

echo "=========================================="
echo "   STARTING LINGUAKIT PROXY SERVER       "
echo "=========================================="

# Load the Bun environment variables if they exist
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Check if Bun is installed; if not, automatically download and install it
if ! command -v bun &> /dev/null
then
    echo "[*] Bun is not installed on this system."
    echo "[*] Automatically installing Bun runtime (takes ~3 seconds)..."
    curl -fsSL https://bun.sh/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
fi

# Double check if Bun installation was successful
if command -v bun &> /dev/null
then
    echo "[*] Detected Bun version: $(bun --version)"
    echo "[*] Launching LinguaKit Translation Proxy..."
    bun server/index.js
else
    echo "[X] ERROR: Could not automatically install Bun. Please install manually from https://bun.sh"
    read -p "Press Enter to exit..."
fi
