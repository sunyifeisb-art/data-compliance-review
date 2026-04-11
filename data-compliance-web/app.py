#!/usr/bin/env python3
"""
数据合规智能审查系统 - Web界面
"""
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
from datetime import datetime
from pathlib import Path
from threading import Thread

from flask import Flask, render_template, request, jsonify, Response, send_file

app = Flask(__name__)

# 配置
BASE_DIR = Path(__file__).parent
WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
PROJECT_ROOT = WORKSPACE_ROOT / 'projects' / 'data-compliance-ai-project-kit'
UPLOAD_FOLDER = BASE_DIR / 'uploads'
OUTPUT_FOLDER = BASE_DIR / 'output'
SCRIPTS_DIR = BASE_DIR / 'scripts'
LOCAL_REGULATION_DB = PROJECT_ROOT / 'knowledge-base' / 'local-regulations.sqlite3'
ALLOWED_EXTENSIONS = {'txt', 'md', 'doc', 'docx', 'pdf'}

# 确保目录存在
UPLOAD_FOLDER.mkdir(exist_ok=True)
OUTPUT_FOLDER.mkdir(exist_ok=True)

# 存储任务状态
tasks = {}


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_risk_level_color(level):
    """获取风险等级对应的颜色"""
    color_map = {
        '高风险': 'red',
        '中风险': 'yellow',
        '建议优化': 'blue',
        '无': 'green'
    }
    return color_map.get(level, 'gray')


def get_risk_level_order(level):
    """获取风险等级排序值"""
    order_map = {
        '无': 0,
        '建议优化': 1,
        '中风险': 2,
        '高风险': 3
    }
    return order_map.get(level, 0)


def load_json_if_exists(path_str):
    if not path_str:
        return None
    path = Path(path_str)
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding='utf-8'))


def run_review_pipeline(task_id, input_path, document_name, is_text=False):
    """
    运行审查流水线，并通过SSE推送进度
    """
    task = tasks[task_id]
    work_dir = OUTPUT_FOLDER / task_id
    work_dir.mkdir(parents=True, exist_ok=True)

    # 更新进度
    checkpoints = [
        ('preprocess', '预处理输入'),
        ('classify', '识别文档类型'),
        ('plan_paths', '规划审查路径'),
        ('generate_tasks', '生成审查任务'),
        ('review', '执行规则化审查', [
            'disclosure_check',
            'purpose_scope_check',
            'lawful_basis_check',
            'sensitive_personal_info_check',
            'field_purpose_legal_basis_check',
            'consent_feature_coupling_check',
            'third_party_sharing_check',
            'outbound_transfer_check',
            'retention_deletion_check',
            'consistency_check'
        ]),
        ('aggregate', '汇总审查结果'),
        ('enrich', '应用法规映射与法规库增强'),
        ('recheck', '自动复核'),
        ('cluster', '风险聚类分析'),
        ('build_packs', '生成专项审查包'),
        ('remediation', '生成整改任务'),
    ]

    def update_progress(step, message, status='running', detail=None):
        task['progress'] = {
            'step': step,
            'total_steps': len(checkpoints),
            'message': message,
            'status': status,
            'detail': detail
        }

    try:
        # 步骤1: 预处理
        update_progress(1, '正在预处理输入文件...')
        time.sleep(0.5)  # 给用户看到进度

        preprocessed = work_dir / '01_preprocessed.json'
        cmd = ['python3', str(SCRIPTS_DIR / 'preprocess_input.py'), '--output', str(preprocessed)]
        if is_text:
            cmd.extend(['--text', input_path.read_text(encoding='utf-8')])
        else:
            cmd.extend(['--file', str(input_path)])
        subprocess.run(cmd, check=True, capture_output=True)

        # 步骤2: 文档类型识别
        update_progress(2, '正在识别文档类型...')
        time.sleep(0.3)

        classification = work_dir / '02_classification.json'
        cmd = ['python3', str(SCRIPTS_DIR / 'classify_document_type.py')]
        if is_text:
            cmd.extend(['--text', input_path.read_text(encoding='utf-8')])
        else:
            cmd.extend(['--file', str(input_path)])
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        classification.write_text(result.stdout, encoding='utf-8')

        # 步骤3: 规划审查路径
        update_progress(3, '正在规划审查路径...')
        time.sleep(0.3)

        planned = work_dir / '03_paths.json'
        result = subprocess.run(
            ['python3', str(SCRIPTS_DIR / 'plan_review_paths.py'), '--classification', str(classification)],
            capture_output=True, text=True, check=True
        )
        planned.write_text(result.stdout, encoding='utf-8')

        # 步骤4: 生成审查任务
        update_progress(4, '正在生成审查任务...')
        time.sleep(0.3)

        tasks_file = work_dir / '04_tasks.json'
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'generate_review_tasks.py'),
            '--classification', str(classification),
            '--planned-paths', str(planned),
            '--output', str(tasks_file)
        ], check=True, capture_output=True)

        # 步骤5: 执行规则化审查（逐个检查点更新进度）
        planned_data = json.loads(planned.read_text(encoding='utf-8'))
        selected_paths = planned_data.get('selected_paths', [])

        findings_dir = work_dir / '06_findings'
        findings_dir.mkdir(parents=True, exist_ok=True)

        for i, path_obj in enumerate(selected_paths):
            path_id = path_obj.get('id') if isinstance(path_obj, dict) else path_obj
            path_name = {
                'disclosure_check': '披露完整性检查',
                'purpose_scope_check': '目的与范围检查',
                'lawful_basis_check': '合法性基础检查',
                'sensitive_personal_info_check': '敏感信息检查',
                'field_purpose_legal_basis_check': '字段-目的-法律基础校验',
                'consent_feature_coupling_check': '同意与功能绑定检查',
                'third_party_sharing_check': '第三方共享检查',
                'outbound_transfer_check': '数据出境检查',
                'retention_deletion_check': '保存与删除检查',
                'consistency_check': '一致性检查'
            }.get(path_id, path_id)

            update_progress(5, f'正在执行审查: {path_name}', detail={
                'current': i + 1,
                'total': len(selected_paths),
                'current_path': path_name
            })

        result = subprocess.run([
            'python3', str(SCRIPTS_DIR / 'run_rule_based_review.py'),
            '--preprocessed', str(preprocessed),
            '--tasks', str(tasks_file),
            '--out-dir', str(findings_dir)
        ], capture_output=True, text=True, check=True)
        findings_data = json.loads(result.stdout)
        # findings 是文件路径列表
        findings_files = findings_data.get('findings', [])

        # 步骤6: 汇总结果
        update_progress(6, '正在汇总审查结果...')
        time.sleep(0.3)

        skeleton = work_dir / '05_report_skeleton.json'
        classification_data = json.loads(classification.read_text(encoding='utf-8'))
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_report_skeleton.py'),
            '--document-name', document_name,
            '--doc-type', classification_data.get('type', 'unknown'),
            '--paths-file', str(planned),
            '--output', str(skeleton)
        ], check=True, capture_output=True)

        final_report = work_dir / '07_report_final.json'

        # 构建命令参数
        cmd = [
            'python3', str(SCRIPTS_DIR / 'aggregate_review_findings.py'),
            '--skeleton', str(skeleton),
            '--output', str(final_report)
        ]
        # 添加 findings 文件路径
        if findings_files:
            cmd.extend(['--findings'] + findings_files)
        else:
            # 如果没有 findings，从目录中读取所有 json 文件
            findings_files = [str(f) for f in findings_dir.glob('*.json')]
            if findings_files:
                cmd.extend(['--findings'] + findings_files)

        subprocess.run(cmd, check=True, capture_output=True)

        # 步骤7: 应用法规映射与法规库增强（可选）
        update_progress(7, '正在应用法规映射与法规库增强...')
        time.sleep(0.3)

        norm_mapping = BASE_DIR / 'config' / 'default-norm-mappings.json'
        mapped_report = work_dir / '07_report_mapped.json'
        enriched_report = work_dir / '07_report_enriched.json'
        if norm_mapping.exists():
            subprocess.run([
                'python3', str(SCRIPTS_DIR / 'apply_external_norm_mapping.py'),
                '--report', str(final_report),
                '--mapping', str(norm_mapping),
                '--output', str(mapped_report)
            ], check=True, capture_output=True)
            report_for_bundle = mapped_report
        else:
            report_for_bundle = final_report

        if LOCAL_REGULATION_DB.exists():
            subprocess.run([
                'python3', str(PROJECT_ROOT / 'scripts' / 'enrich_report_with_regulation_db.py'),
                '--report', str(report_for_bundle),
                '--db', str(LOCAL_REGULATION_DB),
                '--output', str(enriched_report)
            ], check=True, capture_output=True)
            report_for_bundle = enriched_report

        # 步骤8: 自动复核
        update_progress(8, '正在执行自动复核...')
        time.sleep(0.3)

        auto_rechecked_report = work_dir / '07_report_auto_rechecked.json'
        auto_recheck_queue = work_dir / '07_auto_recheck_queue.json'
        risk_clusters = work_dir / '07_risk_clusters.json'
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'auto_recheck_report.py'),
            '--report', str(report_for_bundle),
            '--output', str(auto_rechecked_report),
            '--queue-output', str(auto_recheck_queue),
            '--cluster-output', str(risk_clusters)
        ], check=True, capture_output=True)

        # 步骤9: 风险聚类
        update_progress(9, '正在分析风险聚类...')
        time.sleep(0.3)

        # 步骤10: 生成专项审查包
        update_progress(10, '正在生成专项审查包...')
        time.sleep(0.3)

        application_plan = work_dir / '09_application_plan.json'
        evidence_checklist = work_dir / '10_evidence_checklist.json'
        sdk_partner_pack = work_dir / '11_sdk_partner_review_pack.json'
        cross_border_pack = work_dir / '12_cross_border_review_pack.json'
        privacy_remediation_pack = work_dir / '13_privacy_remediation_pack.json'

        # 应用层场景计划
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_application_scenario_plan.py'),
            '--report', str(auto_rechecked_report),
            '--classification', str(classification),
            '--output', str(application_plan)
        ], check=True, capture_output=True)

        # 证据清单
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_evidence_checklist.py'),
            '--report', str(auto_rechecked_report),
            '--application-plan', str(application_plan),
            '--output', str(evidence_checklist)
        ], check=True, capture_output=True)

        # SDK合作方审查包
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_sdk_partner_review_pack.py'),
            '--report', str(auto_rechecked_report),
            '--application-plan', str(application_plan),
            '--evidence-checklist', str(evidence_checklist),
            '--output', str(sdk_partner_pack)
        ], check=True, capture_output=True)

        # 数据出境审查包
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_cross_border_review_pack.py'),
            '--report', str(auto_rechecked_report),
            '--application-plan', str(application_plan),
            '--evidence-checklist', str(evidence_checklist),
            '--output', str(cross_border_pack)
        ], check=True, capture_output=True)

        # 隐私整改审查包
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_privacy_remediation_pack.py'),
            '--report', str(auto_rechecked_report),
            '--application-plan', str(application_plan),
            '--evidence-checklist', str(evidence_checklist),
            '--output', str(privacy_remediation_pack)
        ], check=True, capture_output=True)

        # 步骤11: 生成整改任务
        update_progress(11, '正在生成整改任务清单...')
        time.sleep(0.3)

        remediation_tasks = work_dir / '14_remediation_tasks.json'
        subprocess.run([
            'python3', str(SCRIPTS_DIR / 'build_remediation_task_plan.py'),
            '--report', str(auto_rechecked_report),
            '--queue', str(auto_recheck_queue),
            '--clusters', str(risk_clusters),
            '--evidence-checklist', str(evidence_checklist),
            '--application-plan', str(application_plan),
            '--output', str(remediation_tasks)
        ], check=True, capture_output=True)

        # 完成任务
        task['status'] = 'completed'
        task['completed_at'] = datetime.now().isoformat()
        task['result'] = {
            'report': str(auto_rechecked_report),
            'remediation': str(remediation_tasks),
            'evidence': str(evidence_checklist),
            'sdk_pack': str(sdk_partner_pack),
            'cross_border_pack': str(cross_border_pack),
            'privacy_pack': str(privacy_remediation_pack)
        }
        task['progress'] = {
            'step': len(checkpoints),
            'total_steps': len(checkpoints),
            'message': '审查完成',
            'status': 'completed'
        }

    except Exception as e:
        import traceback
        error_detail = traceback.format_exc()
        print(f"ERROR in task {task_id}: {error_detail}")
        task['status'] = 'failed'
        task['error'] = str(e)
        task['error_detail'] = error_detail
        task['progress'] = {
            'step': task.get('progress', {}).get('step', 0),
            'total_steps': len(checkpoints),
            'message': f'出错了: {str(e)}',
            'status': 'error'
        }


@app.route('/')
def index():
    """首页 - 上传页面"""
    return render_template('index.html')


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """处理文件上传或文本输入"""
    document_name = request.form.get('document_name', '').strip()
    input_text = request.form.get('input_text', '').strip()

    if not document_name:
        return jsonify({'error': '请输入文档名称'}), 400

    task_id = str(uuid.uuid4())[:8]

    if input_text:
        # 文本输入
        temp_file = UPLOAD_FOLDER / f'{task_id}.txt'
        temp_file.write_text(input_text, encoding='utf-8')

        tasks[task_id] = {
            'id': task_id,
            'document_name': document_name,
            'input_type': 'text',
            'input_path': str(temp_file),
            'status': 'pending',
            'created_at': datetime.now().isoformat()
        }

        # 启动后台线程执行审查
        thread = Thread(target=run_review_pipeline, args=(task_id, temp_file, document_name, True))
        thread.start()

        return jsonify({'task_id': task_id})

    elif 'file' in request.files:
        # 文件上传
        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': '请选择文件'}), 400

        if not allowed_file(file.filename):
            return jsonify({'error': '不支持的文件类型'}), 400

        # 保存上传的文件
        file_path = UPLOAD_FOLDER / f'{task_id}_{file.filename}'
        file.save(file_path)

        tasks[task_id] = {
            'id': task_id,
            'document_name': document_name,
            'input_type': 'file',
            'input_path': str(file_path),
            'original_filename': file.filename,
            'status': 'pending',
            'created_at': datetime.now().isoformat()
        }

        # 启动后台线程执行审查
        thread = Thread(target=run_review_pipeline, args=(task_id, file_path, document_name, False))
        thread.start()

        return jsonify({'task_id': task_id})

    else:
        return jsonify({'error': '请上传文件或输入文本'}), 400


@app.route('/api/progress/<task_id>')
def get_progress(task_id):
    """SSE推送进度"""
    def generate():
        while True:
            if task_id not in tasks:
                yield f'data: {json.dumps({"error": "任务不存在"})}\n\n'
                break

            task = tasks[task_id]
            progress = task.get('progress', {})

            data = {
                'status': task['status'],
                'progress': progress
            }

            yield f'data: {json.dumps(data, ensure_ascii=False)}\n\n'

            if task['status'] in ['completed', 'failed']:
                break

            time.sleep(0.5)

    return Response(generate(), mimetype='text/event-stream')


@app.route('/result/<task_id>')
def result_page(task_id):
    """结果展示页面"""
    if task_id not in tasks:
        return '任务不存在', 404

    task = tasks[task_id]

    if task['status'] != 'completed':
        return render_template('result.html', task=task, report=None)

    # 读取报告
    report_path = Path(task['result']['report'])
    if not report_path.exists():
        return '报告文件不存在', 404

    report = json.loads(report_path.read_text(encoding='utf-8'))

    # 统计风险数量
    risk_stats = {'高风险': 0, '中风险': 0, '建议优化': 0, '无': 0}
    for item in report.get('items', []):
        level = item.get('risk_level', '无')
        if level in risk_stats:
            risk_stats[level] += 1

    # 按风险等级排序
    sorted_items = sorted(
        report.get('items', []),
        key=lambda x: get_risk_level_order(x.get('risk_level', '无')),
        reverse=True
    )

    extra = {
        'remediation': load_json_if_exists(task['result'].get('remediation')),
        'evidence': load_json_if_exists(task['result'].get('evidence')),
        'sdk_pack': load_json_if_exists(task['result'].get('sdk_pack')),
        'cross_border_pack': load_json_if_exists(task['result'].get('cross_border_pack')),
        'privacy_pack': load_json_if_exists(task['result'].get('privacy_pack')),
    }

    return render_template('result.html', task=task, report=report,
                          risk_stats=risk_stats, items=sorted_items, **extra)


@app.route('/api/result/<task_id>')
def get_result(task_id):
    """API获取结果"""
    if task_id not in tasks:
        return jsonify({'error': '任务不存在'}), 404

    task = tasks[task_id]

    if task['status'] != 'completed':
        return jsonify({
            'task_id': task_id,
            'status': task['status'],
            'progress': task.get('progress', {})
        })

    report_path = Path(task['result']['report'])
    report = json.loads(report_path.read_text(encoding='utf-8'))

    return jsonify({
        'task_id': task_id,
        'status': task['status'],
        'document_name': task['document_name'],
        'report': report,
        'remediation': load_json_if_exists(task['result'].get('remediation')),
        'evidence': load_json_if_exists(task['result'].get('evidence')),
        'sdk_pack': load_json_if_exists(task['result'].get('sdk_pack')),
        'cross_border_pack': load_json_if_exists(task['result'].get('cross_border_pack')),
        'privacy_pack': load_json_if_exists(task['result'].get('privacy_pack')),
    })


@app.route('/api/download/<task_id>/<file_type>')
def download_file(task_id, file_type):
    """下载报告文件"""
    if task_id not in tasks:
        return '任务不存在', 404

    task = tasks[task_id]

    if task['status'] != 'completed':
        return '审查尚未完成', 400

    file_mapping = {
        'report': ('report', '.json'),
        'remediation': ('remediation', '.json'),
        'evidence': ('evidence', '.json'),
        'sdk_pack': ('sdk_pack', '.json'),
        'cross_border_pack': ('cross_border_pack', '.json'),
        'privacy_pack': ('privacy_pack', '.json'),
    }

    if file_type not in file_mapping:
        return '不支持的文件类型', 400

    key, ext = file_mapping[file_type]
    file_path = Path(task['result'][key])

    if not file_path.exists():
        return '文件不存在', 404

    return send_file(
        file_path,
        as_attachment=True,
        download_name=f'{task["document_name"]}_{file_type}{ext}'
    )


@app.route('/dev/result')
def dev_mock_result():
    """开发模式：用 test_output/demo_data 中的样例数据直接渲染结果页"""
    demo_dir = BASE_DIR / 'test_output' / 'demo_data'

    # 读取主报告
    report_path = demo_dir / 'report.json'
    report = json.loads(report_path.read_text(encoding='utf-8')) if report_path.exists() else {}

    # 统计风险
    risk_stats = {'高风险': 0, '中风险': 0, '建议优化': 0, '无': 0}
    for item in report.get('items', []):
        level = item.get('risk_level', '无')
        if level in risk_stats:
            risk_stats[level] += 1
    sorted_items = sorted(
        report.get('items', []),
        key=lambda x: get_risk_level_order(x.get('risk_level', '无')),
        reverse=True
    )

    # 读取其他专项包（供前端扩展展示用）
    extra = {}
    for key, filename in [
        ('remediation', 'remediation.json'),
        ('evidence', 'evidence.json'),
        ('sdk_pack', 'sdk_partner.json'),
        ('cross_border_pack', 'cross_border.json'),
        ('privacy_pack', 'privacy.json'),
    ]:
        p = demo_dir / filename
        extra[key] = json.loads(p.read_text(encoding='utf-8')) if p.exists() else None

    task = {
        'id': 'dev-mock',
        'document_name': report.get('document_name', 'Demo 文档'),
        'status': 'completed',
        'created_at': datetime.now().isoformat()
    }

    return render_template('result.html', task=task, report=report,
                          risk_stats=risk_stats, items=sorted_items, **extra)


if __name__ == '__main__':
    print("=" * 60)
    print("数据合规智能审查系统")
    print("=" * 60)
    print(f"访问地址: http://127.0.0.1:5000")
    print("按 Ctrl+C 停止服务")
    print("=" * 60)

    # 自动打开浏览器
    import webbrowser
    webbrowser.open('http://127.0.0.1:5000')

    app.run(debug=True, port=5000)
