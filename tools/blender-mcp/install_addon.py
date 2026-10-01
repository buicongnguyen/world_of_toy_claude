"""Install and enable the MCP for Blender addon in this Blender's user preferences.

Run through the project wrapper so the addon matches the pinned MCP server:
    npm run mcp:install
which calls Blender with:
    blender --background --python tools/blender-mcp/install_addon.py -- <path to bundled addon.py>
"""
import os
import shutil
import sys
import tempfile

import bpy

source = sys.argv[sys.argv.index('--') + 1]
# The installed module name must be stable: the MCP server looks for "blender_mcp".
staged = os.path.join(tempfile.mkdtemp(), 'blender_mcp.py')
shutil.copyfile(source, staged)

bpy.ops.preferences.addon_install(filepath=staged, overwrite=True)
bpy.ops.preferences.addon_enable(module='blender_mcp')
bpy.context.preferences.use_preferences_save = True
bpy.ops.wm.save_userpref()

enabled = 'blender_mcp' in bpy.context.preferences.addons
print(f'BLENDER_MCP_ADDON enabled={enabled} scripts={bpy.utils.user_resource("SCRIPTS")}')
if not enabled:
    sys.exit(1)
