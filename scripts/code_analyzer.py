#!/usr/bin/env python3
"""
Code Analyzer - Generates a function tree from JavaScript files in the src folder.

This script scans for .js files in the src directory, extracts function and 
class/method definitions, and outputs a tree view of the code structure.
"""

import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import argparse

@dataclass
class FunctionInfo:
    name: str
    return_type: str = ""
    params: str = ""
    file: str = ""
    line: int = 0
    is_method: bool = False
    class_name: str = ""

class CodeAnalyzer:
    def __init__(self, root_dir: str):
        # Convert to Path object and resolve to absolute path
        root_path = Path(root_dir).resolve()
        
        # If we're in the scripts directory, go up one level to get project root
        if root_path.name == 'scripts':
            root_path = root_path.parent
            
        self.root_dir = root_path / 'src'  # Focus on src directory
        self.functions: List[FunctionInfo] = []
        self.exclude_dirs = {
            'node_modules',
            'build',
            'dist',
            '.git',
            '__pycache__',
            'venv',
            'emsdk',
            'third_party',
            'external',
            'assets',
            'css',
            'wasm',
            'public',
            'scripts'
        }
        
        # Patterns for JavaScript function/method definitions only
        self.patterns = {
            # Matches: function name() or async function name()
            'function': r'^(?:export\s+)?(?:async\s+)?(?:function\s+)?([a-zA-Z_$][\w$]*)\s*\(',
            # Matches: class Name { ... }
            'class': r'^\s*(?:export\s+)?(?:default\s+)?class\s+([A-Z][\w$]*)',
            # Matches: method() { or async method() { or get method() {
            'class_method': r'^\s*(?:static\s+)?(?:async\s+)?(?:get\s+|set\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*\{?',
            # Matches: const/let/var name = () => {
            'arrow_function': r'^\s*(?:const|let|var|export\s+const)\s+([a-zA-Z_$][\w$]*)\s*=\s*(?:\([^)]*\)|\w+)?\s*=>',
            # Matches: name: function() { or name() {
            'object_method': r'^\s*([a-zA-Z_$][\w$]*)\s*:?\s*(?:function\s*)?\([^)]*\)\s*\{?',
            # Matches: export const name = () => {
            'exported_function': r'^\s*export\s+(?:const|function|async\s+function)\s+([a-zA-Z_$][\w$]*)',
            # Matches: static method() { or static async method() {
            'static_method': r'^\s*static\s+(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\('
        }

    def should_skip(self, path: Path) -> bool:
        """Check if a path should be skipped during traversal."""
        # Skip hidden directories and files
        if any(part.startswith('.') and part not in ['.', '..'] for part in path.parts):
            return True
            
        # Skip excluded directories
        if any(excluded in path.parts for excluded in self.exclude_dirs):
            return True
            
        return False

    def analyze_file(self, file_path: Path):
        """Analyze a single file and extract function/method information."""
        try:
            if not file_path.is_file():
                return
                
            suffix = file_path.suffix.lower()
            if suffix != '.js':
                return
                
            rel_path = file_path.relative_to(self.root_dir) if file_path.is_relative_to(self.root_dir) else file_path
            
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
                
            # Skip minified files
            if len(content) > 50000 and ';' in content and 'function' not in content[:100]:
                print(f"Skipping likely minified file: {rel_path}")
                return
                
            lines = content.splitlines()
            current_class = ""
            in_class = False
            
            for i, line in enumerate(lines, 1):
                line = line.strip()
                if not line or line.startswith(('//', '/*', '*', '*/')):
                    continue
                    
                # Check for class definitions
                class_match = re.search(self.patterns['class'], line)
                if class_match and 'class' in line:
                    current_class = class_match.group(1)
                    in_class = True
                    continue
                
                # Check for methods in class
                if in_class:
                    # Check for static methods first
                    static_method_match = re.search(self.patterns['static_method'], line)
                    if static_method_match:
                        self._add_function(static_method_match, current_class, rel_path, i, is_method=True)
                        continue
                        
                    # Then check for regular methods
                    method_match = re.search(self.patterns['class_method'], line)
                    if method_match and any(x in line for x in ['(', '=>']):
                        self._add_function(method_match, current_class, rel_path, i, is_method=True)
                else:
                    # Check for standalone functions (most specific patterns first)
                    for pattern in [
                        'exported_function',
                        'arrow_function',
                        'function',
                        'object_method'
                    ]:
                        func_match = re.search(self.patterns[pattern], line)
                        if func_match and not any(x in line for x in ['if', 'for', 'while', 'switch']):
                            self._add_function(func_match, '', rel_path, i, is_method=False)
                            break
                
                # Reset class context if we see a closing brace at the start of the line
                if line.startswith('}'):
                    in_class = False
                    current_class = ""
                    
        except Exception as e:
            print(f"Error analyzing {file_path}: {e}")
            
    def _add_function(self, match, class_name, rel_path, line_num, is_method=False):
        """Helper method to add a function to the list."""
        name = match.group(1).strip()
        if not name or name in ['if', 'for', 'while', 'switch', 'catch']:
            return
            
        self.functions.append(FunctionInfo(
            name=name,
            class_name=class_name,
            is_method=is_method,
            file=str(rel_path),
            line=line_num
        ))

    def analyze_directory(self, directory: Optional[Path] = None):
        """Recursively analyze all files in the directory."""
        if directory is None:
            directory = self.root_dir
            
        if self.should_skip(directory):
            return
            
        try:
            for item in directory.iterdir():
                if item.is_dir():
                    self.analyze_directory(item)
                if item.is_file() and item.suffix.lower() == '.js':
                    self.analyze_file(item)
        except Exception as e:
            print(f"Error processing directory {directory}: {e}")

    def generate_report(self):
        """Generate and print the function tree to console."""
        files: Dict[str, Dict[str, List[FunctionInfo]]] = {}
        
        # Group functions by file and class
        for func in self.functions:
            if func.file not in files:
                files[func.file] = {}
                
            class_name = func.class_name or "Global"
            if class_name not in files[func.file]:
                files[func.file][class_name] = []
                
            files[func.file][class_name].append(func)
        
        print("\nJavaScript Code Structure\n" + "=" * 30)
        
        # Print report
        for file_path, classes in sorted(files.items()):
            print(f"\n{file_path}")
            print("-" * len(file_path))
            
            for class_name, functions in sorted(classes.items()):
                if class_name != "Global":
                    print(f"\n  Class: {class_name}")
                
                for func in sorted(functions, key=lambda x: x.line):
                    indent = "    " if class_name != "Global" else "  "
                    prefix = "[m] " if func.is_method else "[f] "
                    print(f"{indent}{prefix}{func.name} (line {func.line})")
        
        # Find potential duplicates
        print("\nPotential Duplicates\n" + "-" * 18)
        func_names = {}
        for func in self.functions:
            if func.name not in func_names:
                func_names[func.name] = []
            func_names[func.name].append(func)
        
        duplicates_found = False
        for name, funcs in sorted(func_names.items()):
            # Only show non-method duplicates that appear multiple times
            if len(funcs) > 1 and not any(f.is_method for f in funcs):
                duplicates_found = True
                print(f"{name} (x{len(funcs)}):")
                for func in funcs:
                    print(f"  {func.file}:{func.line}")
        
        if not duplicates_found:
            print("No potential duplicates found.")
            
        print("\n" + "=" * 30)

def main():
    # Set up argument parser with default values for PyCharm
    parser = argparse.ArgumentParser(description='Analyze JavaScript code structure in src directory.')
    parser.add_argument('--dir', default=os.getcwd(), help='Root directory (default: current directory)')
    
    args = parser.parse_args()
    
    analyzer = CodeAnalyzer(args.dir)
    print(f"🔍 Analyzing JavaScript files in {analyzer.root_dir}...")
    analyzer.analyze_directory()
    analyzer.generate_report()
    
    # Add this line to keep the console open when running from PyCharm
    if 'PYCHARM_HOSTED' in os.environ:
        input("\nPress Enter to exit...")

if __name__ == "__main__":
    main()
