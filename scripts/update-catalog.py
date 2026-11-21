#!/usr/bin/env python3
"""Import markdown-badges and generate an offline icon sprite from simple-icons."""
import argparse
import collections
import json
import re
import subprocess
import tarfile
import urllib.parse
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
UPSTREAM = 'https://raw.githubusercontent.com/Ileriayo/markdown-badges/'
ICONS_PACKAGE = 'simple-icons@16.8.0'
CATEGORIES = {
    'Programming Languages': 'Languages',
    'Frameworks & Libraries': ('Frameworks, Platforms and Libraries|Frontend|CSS Frameworks|Backend|'
                               'Mobile|ML/AI|ML/DL|ORM|Quantum Programming Frameworks and Libraries|Geospatial'),
    'Databases': 'Databases',
    'Development Tools & IDEs': 'IDEs/Editors|CI|CD|DevOps|Build Tools|Build Toolchains|Terminals|Version Control',
    'Cloud & Hosting': 'Hosting/SaaS|Cloud Storage|Servers|Networking',
    'Operating Systems': 'Operating System',
    'Desktop Environments': 'DE/WM',
    'Testing': 'Testing',
    'Documentation & Data Formats': 'Documentation Platforms',
    'Design & Productivity': 'Design|CAD|Office',
    'Other': ('Artificial Intelligence and Bots|Blockchain|Blog|Browsers|Cryptocurrency|Developer/Forums|Education|'
              'Funding|Gaming|Game Consoles|Hardware|Music|Other|Home Automation|Security|Search Engines|Social|'
              'Smartphone Brands|Store|Streaming|VPNs|Wearables|Work/Jobs'),
}
CATEGORY_MAP = {source: name for name, sources in CATEGORIES.items() for source in sources.split('|')}
CATEGORY_FIXES = {name: 'Documentation & Data Formats' for name in ('json', 'markdown', 'latex', 'yaml', 'xml', 'toml')}
ALIASES = {
    'c++': ['cpp', 'cplusplus'], 'c#': ['csharp', 'dotnet'], 'java': ['jdk', 'jvm'],
    'javascript': ['js', 'ecmascript'], 'typescript': ['ts'], 'python': ['py', 'python3'],
    'node.js': ['nodejs', 'node'], 'react': ['reactjs', 'react.js'], 'vue.js': ['vue', 'vuejs'],
    'visual-studio-code': ['VS Code', 'Visual Studio Code', 'vscode'],
    'postgresql': ['postgres', 'pgsql'], 'github-pages': ['gh pages'],
    'kde-plasma': ['kde', 'plasma'], 'jupyter-notebook': ['jupyter', 'ipynb'],
    'aws-lightsail': ['Amazon Lightsail', 'AWS'], 'linux-mint': ['mint'],
}
POPULAR = ('Python|JavaScript|TypeScript|React|Node.js|Docker|Git|GitHub|Java|C++|Rust|Go|'
           'PostgreSQL|Linux|Visual Studio Code|HTML5|CSS3|Vue.js|Ubuntu|Kubernetes|'
           'Markdown|Next.js|Tailwind CSS|Figma|MySQL|Redis|NumPy|Pandas|Vite|Django|'
           'GitHub Actions|Spring|Arch Linux|SQLite|Blender|JSON').split('|')
SUPPLEMENT = (
    ('SQL', 'Databases', '4479A1', '', 'white'),
    ('Tkinter', 'Frameworks & Libraries', '3776AB', 'python', 'white'),
    ('CustomTkinter', 'Frameworks & Libraries', '285A83', 'python', 'white'),
    ('Matplotlib', 'Frameworks & Libraries', '11557C', '', 'white'),
    ('GitHub Desktop', 'Development Tools & IDEs', '6F42C1', 'github', 'white'),
    ('Visual Studio Code', 'Development Tools & IDEs', '007ACC', '', 'white'),
    ('GitHub Codespaces', 'Development Tools & IDEs', '24292F', 'github', 'white'),
    ('AWS Lightsail', 'Cloud & Hosting', 'FF9900', '', 'black'),
    ('Windows 11', 'Operating Systems', '0078D4', '', 'white'),
    ('JSON', 'Documentation & Data Formats', '323330', 'json', 'white'),
    ('Microsoft Word', 'Design & Productivity', '2B579A', '', 'white'),
    ('Microsoft Excel', 'Design & Productivity', '217346', '', 'white'),
    ('Microsoft PowerPoint', 'Design & Productivity', 'B7472A', '', 'white'),
)
MARKDOWN_IMAGE = re.compile(r'!\[([^\]]*)\]\((https?://[^)\s]+)\)')
BADGE_PATH = re.compile(r'/badge/(.+)-(%23|#)?([0-9a-fA-F]{3,8})(?:\.svg)?$')


def badge_id(name):
    name = name.lower().replace('+', ' plus ').replace('#', ' sharp ')
    return re.sub(r'[^a-z0-9]+', '-', name).strip('-')


def read_upstream(markdown, icons):
    section = None
    for line in markdown.split('# Badges\n', 1)[1].splitlines():
        if line.startswith('#'):
            heading = line.lstrip('# ').strip()
            heading = re.sub(r'^[^\w]+', '', heading)
            if heading:
                section = heading
        if not line.startswith('|') or not (image := MARKDOWN_IMAGE.search(line)):
            continue
        name = line.split('|', 2)[1].strip()
        alt, original = image.groups()
        name = re.sub(r'^\[([^\]]+)\]\(.*\)$', r'\1', name).strip('`* ') or alt
        key = badge_id(name)
        parts = urllib.parse.urlsplit(original)
        path = BADGE_PATH.fullmatch(parts.path)
        if not key or not path or parts.hostname not in ('img.shields.io', 'shields.io'):
            raise ValueError(f'Unrecognised badge for {name}: {original}')
        label = urllib.parse.unquote(path[1]).replace('--', '\0').replace('__', '\1').replace('_', ' ')
        label = label.replace('\0', '-').replace('\1', '_')
        params = dict(urllib.parse.parse_qsl(parts.query))
        logo = params.get('logo', '')
        slug = re.sub(r'[^a-z0-9]', '', logo.lower())
        if slug in icons and logo != slug:
            logo = slug
            params['logo'] = slug
            original = urllib.parse.urlunsplit(('https', 'img.shields.io', parts.path,
                                                urllib.parse.urlencode(params), ''))
        category = CATEGORY_FIXES.get(key, CATEGORY_MAP.get(section, 'Other'))
        yield {
            'id': key, 'name': name, 'category': category,
            'aliases': list(dict.fromkeys([*ALIASES.get(key, []), section, *([alt] if alt != name else [])])),
            'original': {'label': label, 'color': path[3], 'logo': logo,
                         'logoColor': params.get('logoColor', ''), 'style': params['style'],
                         'logoSize': params.get('logoSize', ''), 'url': original},
        }


def supplemental_badges():
    for name, category, color, logo, logo_color in SUPPLEMENT:
        key = badge_id(name)
        yield {
            'id': key, 'name': name, 'category': category, 'aliases': ALIASES.get(key, []),
            'original': {'label': name, 'color': color, 'logo': logo, 'logoColor': logo_color,
                         'style': 'for-the-badge'},
        }


def write_assets(archive, markdown, revision):
    with tarfile.open(archive, 'r:gz') as package:
        icons = {Path(entry.name).stem: entry for entry in package.getmembers()
                 if entry.isfile() and entry.name.startswith('package/icons/') and entry.name.endswith('.svg')}
        source = list(read_upstream(markdown, icons))
        badges = {}
        for badge in [*source, *supplemental_badges()]:
            previous = badges.setdefault(badge['id'], badge)
            previous['aliases'] = list(dict.fromkeys([*previous['aliases'], *badge['aliases']]))
        priority = {badge_id(name): i for i, name in enumerate(POPULAR)}
        ordered = sorted(badges.values(), key=lambda badge: (priority.get(badge['id'], len(priority)), badge['name'].casefold()))
        catalogue = {'revision': revision, 'categories': list(CATEGORIES), 'badges': ordered}
        (ROOT / 'data/badges.json').write_text(json.dumps(catalogue, ensure_ascii=False, separators=(',', ':')) + '\n')
        slugs = sorted({badge['original']['logo'] for badge in ordered} & icons.keys())
        symbols = []
        for slug in slugs:
            icon = package.extractfile(icons[slug]).read().decode()
            path = re.search(r'<path d="([^"]+)"', icon)[1]
            symbols.append(f'<symbol id="{slug}" viewBox="0 0 24 24"><path d="{path}"/></symbol>')
        (ROOT / 'assets/logos.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg">\n' + '\n'.join(symbols) + '\n</svg>\n')
        license_text = package.extractfile('package/LICENSE.md').read()
        (ROOT / 'licenses/simple-icons.txt').write_bytes(license_text)
    print(f'Imported {len(source)} rows, {len(ordered)} distinct badges including supplements, and {len(slugs)} local logos.')
    print(dict(collections.Counter(badge['category'] for badge in ordered)))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--ref', default='master', help='Upstream commit, tag or branch')
    parser.add_argument('--upstream-file', type=Path, help='Read a local upstream README instead of downloading it')
    parser.add_argument('--icons-archive', type=Path, help='Use an existing simple-icons npm archive')
    args = parser.parse_args()
    with TemporaryDirectory() as folder:
        archive = args.icons_archive
        if archive is None:
            subprocess.run(['npm', '--cache', f'{folder}/npm-cache', 'pack', ICONS_PACKAGE,
                            '--pack-destination', folder, '--silent'], check=True)
            archive = next(Path(folder).glob('simple-icons-*.tgz'))
        if args.upstream_file:
            markdown = args.upstream_file.read_text()
        else:
            with urllib.request.urlopen(f'{UPSTREAM}{args.ref}/README.md', timeout=30) as response:
                markdown = response.read().decode()
            with urllib.request.urlopen(f'{UPSTREAM}{args.ref}/LICENSE', timeout=30) as response:
                (ROOT / 'licenses/markdown-badges.txt').write_bytes(response.read())
        write_assets(archive, markdown, args.ref)


if __name__ == '__main__':
    main()
