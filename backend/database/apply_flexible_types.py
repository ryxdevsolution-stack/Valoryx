"""
Apply flexible types to all model files
Converts UUID (String(36)) and JSONB to FlexibleUUID and FlexibleJSON
"""
import re
import os
import sys

# Force UTF-8 for Windows
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')
    sys.stderr = codecs.getwriter('utf-8')(sys.stderr.buffer, 'strict')

# Models that need updating
models_to_update = [
    'models/report_model.py',
    'models/client_model.py',
    'models/customer_model.py',
    'models/user_model.py',
    'models/payment_model.py',
    'models/expense_model.py',
    'models/permission_model.py',
    'models/notes_model.py',
    'models/bulk_stock_order_model.py'
]

for model_file in models_to_update:
    if not os.path.exists(model_file):
        continue

    print(f"Updating {model_file}...")

    with open(model_file, 'r', encoding='utf-8') as f:
        content = f.read()

    original_content = content

    # Add imports if not already present
    if 'FlexibleUUID' not in content and 'FlexibleJSON' not in content and 'FlexibleNumeric' not in content:
        # Find the import section
        import_match = re.search(r'(from extensions import db.*?\n)', content)
        if import_match:
            imports = import_match.group(1)
            new_imports = imports + 'from database.flexible_types import FlexibleUUID, FlexibleJSON, FlexibleNumeric\n'
            content = content.replace(imports, new_imports)

    # Replace db.String(36) with FlexibleUUID
    content = re.sub(r'db\.Column\(db\.String\(36\)', 'db.Column(FlexibleUUID', content)

    # Replace JSONB with FlexibleJSON
    content = re.sub(r'db\.Column\(JSONB', 'db.Column(FlexibleJSON', content)

    # Replace db.Numeric with FlexibleNumeric
    content = re.sub(r'db\.Column\(db\.Numeric\((\d+),\s*(\d+)\)', r'db.Column(FlexibleNumeric', content)

    if content != original_content:
        with open(model_file, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"  ✓ Updated {model_file}")
    else:
        print(f"  - No changes needed for {model_file}")

print("\n✓ All models updated!")
