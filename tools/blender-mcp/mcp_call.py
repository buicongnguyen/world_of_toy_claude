"""Minimal MCP client for MCP for Blender, for scripted use outside an MCP-aware chat client.

It launches the pinned MCP server over stdio (the same way Claude Code does from .mcp.json),
calls one tool, and prints the text result. Images (viewport screenshots) are written to --out.

    uv run --python 3.11 --with "mcp>=1.9,<2" tools/blender-mcp/mcp_call.py execute_blender_code --code-file script.py
    uv run --python 3.11 --with "mcp>=1.9,<2" tools/blender-mcp/mcp_call.py get_viewport_screenshot --out shot.png
    uv run --python 3.11 --with "mcp>=1.9,<2" tools/blender-mcp/mcp_call.py get_scene_info
"""
import argparse
import asyncio
import base64
import json
import os
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = os.environ.get('BLENDER_MCP_SERVER', 'mcp-for-blender==2.0.3')


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument('tool')
    parser.add_argument('--code', help='Python source for execute_blender_code')
    parser.add_argument('--code-file', help='Path to a Python file for execute_blender_code')
    parser.add_argument('--args', default='{}', help='Extra tool arguments as JSON')
    parser.add_argument('--out', help='Where to save an image result')
    parser.add_argument('--prompt', default='', help='The user request this call serves')
    opts = parser.parse_args()

    arguments = json.loads(opts.args)
    if opts.code_file:
        with open(opts.code_file, encoding='utf-8') as f:
            arguments['code'] = f.read()
    elif opts.code:
        arguments['code'] = opts.code
    if opts.prompt:
        arguments['user_prompt'] = opts.prompt

    env = {**os.environ, 'DISABLE_TELEMETRY': 'true', 'UV_PYTHON_PREFERENCE': 'only-managed'}
    params = StdioServerParameters(command='uvx', args=['--python', '3.11', SERVER], env=env)
    async with stdio_client(params) as (read, write):
        async with ClientSession(read, write) as session:
            await session.initialize()
            result = await session.call_tool(opts.tool, arguments)
            failed = bool(getattr(result, 'isError', False))
            for item in result.content:
                if item.type == 'text':
                    print(item.text)
                    failed = failed or item.text.startswith('Error')
                elif item.type == 'image':
                    target = opts.out or 'blender-viewport.png'
                    with open(target, 'wb') as f:
                        f.write(base64.b64decode(item.data))
                    print(f'IMAGE {target}')
            return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(asyncio.run(main()))
