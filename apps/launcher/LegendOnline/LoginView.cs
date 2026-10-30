using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;

namespace LegendOnline;

internal sealed class LoginView : CardView
{
	private bool register;

	private bool busy;

	private string error = "";

	private string info = "";

	private readonly TextBox user = new TextBox();

	private readonly TextBox pass = new TextBox();

	private readonly TextBox pass2 = new TextBox();

	private Rectangle segLogin;

	private Rectangle segRegister;

	private Rectangle submitRect;

	private Rectangle userBox;

	private Rectangle passBox;

	private Rectangle pass2Box;

	private readonly LoginAction submitButton = new LoginAction();

	private readonly LoginAction modeButton = new LoginAction { Secondary = true };

	private Rectangle formBounds;

	private readonly Timer anim = new Timer();

	public string UserText
	{
		get
		{
			return user.Text.Trim();
		}
		set
		{
			user.Text = value ?? "";
		}
	}

	public bool Register => register;

	protected override Size CardSize => new Size(Theme.S(300), Theme.S(register ? 334 : 266));

	public event Action<string, string, bool> Submit;

	public LoginView(IEnumerable<string> knownUsers)
	{
		TextBox[] array = new TextBox[3] { user, pass, pass2 };
		foreach (TextBox textBox in array)
		{
			textBox.BorderStyle = BorderStyle.None;
			textBox.BackColor = Theme.Background;
			textBox.ForeColor = Theme.Text;
			textBox.KeyDown += OnFieldKey;
			textBox.TextChanged += delegate
			{
				if (error.Length > 0)
				{
					error = "";
					Invalidate();
				}
			};
			textBox.GotFocus += delegate
			{
				Invalidate();
			};
			textBox.LostFocus += delegate
			{
				Invalidate();
			};
			base.Controls.Add(textBox);
		}
		user.TabIndex = 0;
		pass.TabIndex = 1;
		pass2.TabIndex = 2;
		submitButton.TabIndex = 3;
		modeButton.TabIndex = 4;
		submitButton.Click += delegate { DoSubmit(); };
		modeButton.Click += delegate { if (!busy) SetMode(!register); };
		Controls.Add(submitButton);
		Controls.Add(modeButton);
		user.MaxLength = 254;
		user.AccessibleName = "Usuário ou email";
		pass.AccessibleName = "Senha";
		pass2.AccessibleName = "Repita a senha";
		pass.MaxLength = 128;
		pass2.MaxLength = 128;
		pass.UseSystemPasswordChar = true;
		pass2.UseSystemPasswordChar = true;
		user.AutoCompleteMode = AutoCompleteMode.SuggestAppend;
		user.AutoCompleteSource = AutoCompleteSource.CustomSource;
		AutoCompleteStringCollection autoCompleteStringCollection = new AutoCompleteStringCollection();
		foreach (string knownUser in knownUsers)
		{
			autoCompleteStringCollection.Add(knownUser);
		}
		user.AutoCompleteCustomSource = autoCompleteStringCollection;
		anim.Interval = 16;
		anim.Tick += delegate
		{
			submitButton.Invalidate();
		};
		LayoutFields();
	}

	public void SetMode(bool registerMode)
	{
		register = registerMode;
		error = "";
		pass2.Text = "";
		user.MaxLength = (register ? 20 : 254);
		LayoutFields();
		Invalidate();
		FocusFirstEmpty();
	}

	public void SetBusy(bool on)
	{
		busy = on;
		submitButton.Busy = on;
		submitButton.Enabled = !on;
		modeButton.Enabled = !on;
		anim.Enabled = on;
		TextBox textBox = user;
		TextBox textBox2 = pass;
		bool flag = (pass2.Enabled = !on);
		bool enabled = (textBox2.Enabled = flag);
		textBox.Enabled = enabled;
		Invalidate();
	}

	public void ShowError(string text)
	{
		error = text ?? "";
		info = "";
		Invalidate();
	}

	public void ShowInfo(string text)
	{
		info = text ?? "";
		error = "";
		Invalidate();
	}

	public void ClearPasswords()
	{
		pass.Text = "";
		pass2.Text = "";
	}

	public void FocusFirstEmpty()
	{
		if (base.Visible)
		{
			TextBox textBox = ((user.Text.Length == 0) ? user : ((pass.Text.Length == 0) ? pass : ((register && pass2.Text.Length == 0) ? pass2 : pass)));
			textBox.Focus();
			textBox.SelectionStart = textBox.Text.Length;
		}
	}

	protected override void OnResize(EventArgs e)
	{
		base.OnResize(e);
		LayoutFields();
	}

	public void LayoutFields()
	{
		// Center within this account's content area; the top bar is outside this control.
		int width = Math.Max(1, Math.Min(CardSize.Width, Width - Theme.S(48)));
		int height = CardSize.Height;
		formBounds = new Rectangle((Width - width) / 2, Math.Max(Theme.S(16), (Height - height) / 2), width, height);
		int y = formBounds.Y;
		userBox = new Rectangle(formBounds.X, y + Theme.S(20), width, Theme.S(30));
		y += Theme.S(68);
		passBox = new Rectangle(formBounds.X, y + Theme.S(20), width, Theme.S(30));
		y += Theme.S(68);
		pass2Box = register ? new Rectangle(formBounds.X, y + Theme.S(20), width, Theme.S(30)) : Rectangle.Empty;
		if (register) y += Theme.S(68);
		pass2.Visible = register;
		submitRect = new Rectangle(formBounds.X, y + Theme.S(6), width, Theme.S(40));
		Rectangle modeLink = new Rectangle(formBounds.X, submitRect.Bottom + Theme.S(12), width, Theme.S(28));
		segLogin = register ? modeLink : Rectangle.Empty;
		segRegister = register ? Rectangle.Empty : modeLink;
		submitButton.Bounds = submitRect;
		submitButton.Text = register ? "Criar conta e jogar" : "Entrar";
		modeButton.Bounds = modeLink;
		modeButton.Text = register ? "Já tenho uma conta" : "Criar conta";
		foreach (var pair in new[] {
			new KeyValuePair<TextBox, Rectangle>(user, userBox),
			new KeyValuePair<TextBox, Rectangle>(pass, passBox),
			new KeyValuePair<TextBox, Rectangle>(pass2, pass2Box) })
		{
			pair.Key.Font = Theme.Input;
			if (pair.Value.IsEmpty) continue;
			int preferredHeight = pair.Key.PreferredHeight;
			pair.Key.SetBounds(pair.Value.X, pair.Value.Y + (pair.Value.Height - preferredHeight) / 2,
				pair.Value.Width, preferredHeight);
		}
		Invalidate();
	}

	protected override void OnPaint(PaintEventArgs e)
	{
		Graphics graphics = e.Graphics;
		Theme.Prepare(graphics);
		graphics.Clear(Theme.Background);

		DrawField(graphics, register ? "Usuário" : "Usuário ou email", userBox, user);
		DrawField(graphics, "Senha", passBox, pass);
		if (register)
		{
			DrawField(graphics, "Repita a senha", pass2Box, pass2);
		}
		Rectangle modeLink = register ? segLogin : segRegister;
		string text = ((error.Length > 0) ? error : info);
		if (text.Length > 0)
		{
			Theme.DrawWrapped(graphics, text, Theme.UiSmall, (error.Length > 0) ? Theme.Danger : Theme.Muted, new RectangleF(formBounds.X, modeLink.Bottom + Theme.S(8), formBounds.Width, Theme.S(36)), StringAlignment.Center);
		}
	}

	private void DrawField(Graphics g, string caption, Rectangle box, TextBox t)
	{
		Theme.DrawText(g, caption, Theme.UiSmall, Theme.Muted, new RectangleF(box.X, box.Y - Theme.S(21), box.Width, Theme.S(18)), StringAlignment.Near);
		using Pen line = new Pen(t.Focused ? Theme.Mix(Theme.Accent, Theme.Background, 0.3f) : Theme.FieldBorder, Theme.S(1f));
		g.DrawLine(line, box.Left, box.Bottom, box.Right, box.Bottom);
	}

	protected override void OnMouseMove(MouseEventArgs e)
	{
		base.OnMouseMove(e);
		Cursor = !busy && (userBox.Contains(e.Location) || passBox.Contains(e.Location) || (register && pass2Box.Contains(e.Location))) ? Cursors.IBeam : Cursors.Default;
	}

	protected override void OnMouseDown(MouseEventArgs e)
	{
		base.OnMouseDown(e);
		if (e.Button == MouseButtons.Left && !busy)
		{
			if (userBox.Contains(e.Location))
			{
				user.Focus();
			}
			else if (passBox.Contains(e.Location))
			{
				pass.Focus();
			}
			else if (register && pass2Box.Contains(e.Location))
			{
				pass2.Focus();
			}
		}
	}

	private void OnFieldKey(object sender, KeyEventArgs e)
	{
		if (e.KeyCode == Keys.Return)
		{
			e.SuppressKeyPress = true;
			if (sender == user)
			{
				pass.Focus();
			}
			else if (sender == pass && register)
			{
				pass2.Focus();
			}
			else
			{
				DoSubmit();
			}
		}
	}

	protected override void OnGotFocus(EventArgs e)
	{
		base.OnGotFocus(e);
		FocusFirstEmpty();
	}

	public void Fill(string u, string p, bool registerMode)
	{
		if (registerMode != register)
		{
			SetMode(registerMode);
		}
		user.Text = u;
		pass.Text = p;
		pass2.Text = p;
	}

	public void DoSubmit()
	{
		if (busy)
		{
			return;
		}
		string text = user.Text.Trim();
		if (text.Length == 0 || pass.Text.Length == 0)
		{
			ShowError("Preencha usuário e senha.");
			FocusFirstEmpty();
			return;
		}
		if (register)
		{
			if (text.Length < 3 || text.Length > 20 || !IsUserName(text))
			{
				ShowError("O usuário deve ter de 3 a 20 letras, números ou _.");
				user.Focus();
				return;
			}
			if (pass.Text != pass2.Text)
			{
				ShowError("As senhas não são iguais.");
				pass2.Focus();
				return;
			}
		}
		this.Submit?.Invoke(text, pass.Text, register);
	}

	private static bool IsUserName(string s)
	{
		foreach (char c in s)
		{
			if ((c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') && c != '_')
			{
				return false;
			}
		}
		return true;
	}

	// Native Button keyboard/accessibility behavior with the launcher's GDI+ styling.
	private sealed class LoginAction : Button
	{
		public bool Secondary;
		public bool Busy;
		private bool hover;
		private bool pressed;

		public LoginAction()
		{
			SetStyle(ControlStyles.UserPaint | ControlStyles.AllPaintingInWmPaint | ControlStyles.OptimizedDoubleBuffer | ControlStyles.ResizeRedraw, true);
			FlatStyle = FlatStyle.Flat;
			FlatAppearance.BorderSize = 0;
			BackColor = Theme.Background;
			Cursor = Cursors.Hand;
			UseVisualStyleBackColor = false;
		}

		protected override void OnMouseEnter(EventArgs e) { base.OnMouseEnter(e); hover = true; Invalidate(); }
		protected override void OnMouseLeave(EventArgs e) { base.OnMouseLeave(e); hover = false; Invalidate(); }
		protected override void OnMouseDown(MouseEventArgs e) { base.OnMouseDown(e); if (e.Button == MouseButtons.Left) pressed = true; Invalidate(); }
		protected override void OnMouseUp(MouseEventArgs e) { pressed = false; base.OnMouseUp(e); Invalidate(); }
		protected override void OnMouseCaptureChanged(EventArgs e) { base.OnMouseCaptureChanged(e); if (!Capture) pressed = false; Invalidate(); }
		protected override void OnKeyDown(KeyEventArgs e) { if (e.KeyCode == Keys.Space) pressed = true; base.OnKeyDown(e); Invalidate(); }
		protected override void OnKeyUp(KeyEventArgs e) { pressed = false; base.OnKeyUp(e); Invalidate(); }
		protected override void OnGotFocus(EventArgs e) { base.OnGotFocus(e); Invalidate(); }
		protected override void OnLostFocus(EventArgs e) { pressed = false; base.OnLostFocus(e); Invalidate(); }
		protected override void OnEnabledChanged(EventArgs e) { pressed = false; hover = false; base.OnEnabledChanged(e); Invalidate(); }

		protected override void OnPaint(PaintEventArgs e)
		{
			Graphics g = e.Graphics;
			Theme.Prepare(g);
			g.Clear(Theme.Background);
			Rectangle rect = new Rectangle(0, 0, Width - 1, Height - 1);
			if (!Secondary)
			{
				Color fill = !Enabled ? Theme.Mix(Theme.Accent, Theme.Background, 0.55f) : pressed ? Theme.Mix(Theme.Accent, Theme.AccentText, 0.22f) : hover ? Theme.AccentHover : Theme.Accent;
				Theme.FillRound(g, fill, rect, Theme.S(4));
			}
			if (Busy)
			{
				float size = Theme.S(16f);
				using Pen pen = new Pen(Theme.AccentText, Theme.S(2f)) { StartCap = LineCap.Round, EndCap = LineCap.Round };
				g.DrawArc(pen, (Width - size) / 2, (Height - size) / 2, size, size, Environment.TickCount % 900 / 900f * 360, 270);
			}
			else
			{
				Color color = Secondary ? (!Enabled ? Theme.Faint : pressed || hover || Focused ? Theme.Accent : Theme.Muted) : Theme.AccentText;
				Theme.DrawText(g, Text, Secondary ? Theme.Ui : Theme.Font(10f, true), color, rect, StringAlignment.Center);
			}
			if (Focused && Enabled)
			{
				rect.Inflate(-Theme.S(3), -Theme.S(3));
				ControlPaint.DrawFocusRectangle(g, rect, Secondary ? Theme.Accent : Theme.AccentText, Secondary ? Theme.Background : Theme.Accent);
			}
		}
	}

	protected override void Dispose(bool disposing)
	{
		if (disposing)
		{
			anim.Dispose();
		}
		base.Dispose(disposing);
	}
}
