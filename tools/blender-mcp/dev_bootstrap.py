"""Paste-able prelude for live MCP sessions: (re)loads the asset pipeline modules inside the
running Blender so edits on disk take effect without restarting Blender.

    exec(open(r'<repo>/tools/blender-mcp/dev_bootstrap.py').read())
"""
import importlib
import os
import sys

REPO = os.environ.get('LANTERN_REPO') or os.path.abspath(os.path.join(os.path.dirname(__file__ if '__file__' in dir() else '.'), '..', '..'))
if not os.path.isdir(os.path.join(REPO, 'art', 'blender', 'lantern')):
    REPO = os.getcwd()
ART = os.path.join(REPO, 'art', 'blender')
if ART not in sys.path:
    sys.path.insert(0, ART)
import lantern  # noqa: E402
from lantern import core, textures, preview  # noqa: E402

for name in ('core', 'textures', 'preview', 'fruit', 'characters', 'props', 'world', 'build'):
    mod = sys.modules.get('lantern.' + name)
    if mod is None:
        try:
            mod = importlib.import_module('lantern.' + name)
        except ModuleNotFoundError:
            continue
    importlib.reload(mod)
from lantern import core, textures, preview  # noqa: E402,F811
