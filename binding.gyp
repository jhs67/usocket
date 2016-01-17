{
	'targets': [
		{
			'target_name': 'uwrap',
			'sources': [
				'src/uwrap.cc',
			],
			'cflags': [
				'-Wall',
			],
			'include_dirs' : [
				"<!(node -e \"require('nan')\")"
			],
			'xcode_settings': {
				'MACOSX_DEPLOYMENT_TARGET':'10.7',
				'OTHER_CFLAGS': [ '--stdlib=libc++' ],
			},
		},
	],
}
