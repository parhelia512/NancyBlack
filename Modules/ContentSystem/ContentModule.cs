﻿using Nancy;
using NantCom.NancyBlack.Modules.ContentSystem;
using NantCom.NancyBlack.Modules.ContentSystem.Types;
using NantCom.NancyBlack.Modules.DatabaseSystem;
using NantCom.NancyBlack.Modules.MembershipSystem;
using Newtonsoft.Json.Linq;
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Web;

namespace NantCom.NancyBlack.Modules
{
    public class ContentModule : BaseModule
    {
        /// <summary>
        /// Allow custom mapping of input url into another url
        /// </summary>
        public static event Func<NancyContext, dynamic, string, string> RewriteUrl = (ctx, arg, url)=> url;

        /// <summary>
        /// Allow custom mapping of requested content into another content
        /// </summary>
        public static event Action<NancyContext, dynamic> MapContent = delegate { };

        private static string _RootPath;

        public ContentModule()
        {
            Get["/{path*}"] = this.HandleRequest(this.HandleContentRequest);

            Get["/"] = this.HandleRequest(this.HandleContentRequest);

            _RootPath = this.RootPath;
        }

        /// <summary>
        /// Generates the layout page.
        /// </summary>
        /// <param name="site">The site.</param>
        /// <param name="content">The content.</param>
        protected void GenerateLayoutPage(dynamic site, dynamic content)
        {
            var layout = (string)content.Layout;
            
            string layoutPath = Path.Combine(this.RootPath, "Site", "Views", Path.GetDirectoryName(layout));
            string layoutFilename = Path.Combine(layoutPath, Path.GetFileName(layout) + ".cshtml");

            if (File.Exists(layoutFilename))
            {
                return;
            }

            Directory.CreateDirectory(layoutPath);

            var sourceFile = Path.Combine(this.RootPath, "Content", "Views", "_base" + Path.GetFileName(layout) + "layout.cshtml");
            if (File.Exists(sourceFile) == false)
            {
                sourceFile = Path.Combine(this.RootPath, "Content", "Views", "_basecontentlayout.cshtml");
            }
            File.Copy(sourceFile, layoutFilename);
        }
        
        protected dynamic HandleContentRequest(dynamic arg)
        {
            var url = (string)arg.path;
            if (url == null)
            {
                url = "/";
            }

            if (url.StartsWith("/") == false)
            {
                url = "/" + url;
            }

            // invalid admin links
            if (url.StartsWith("/Admin", StringComparison.InvariantCultureIgnoreCase))
            {
                return 404;
            }

            // invalid system links
            if (url.StartsWith("/_", StringComparison.InvariantCultureIgnoreCase))
            {
                return 404;
            }

            // invalid table get request
            if (url.StartsWith("/tables", StringComparison.InvariantCultureIgnoreCase))
            {
                return 404;
            }

            dynamic requestedContent = null;

            //
            url = ContentModule.RewriteUrl(this.Context, arg, url);

            // see if the url is collection request or content request
            var parts = url.Split('/');
            if (parts.Length > 2 && parts[1].EndsWith("s"))
            {
                // seems to be a collection
                var typeName = parts[1].Substring(0, parts[1].Length - 1);
                requestedContent = this.SiteDatabase.QueryAsDynamic(typeName, string.Format("Url eq '{0}'", url)).FirstOrDefault();

                if (requestedContent != null)
                {
                    requestedContent.typeName = typeName;
                }
            }

            // if failed to get from table, use content table instead
            if (requestedContent == null)
            {
                requestedContent = ContentModule.GetContent(this.SiteDatabase, url);
            }

            if (requestedContent == null)
            {
                // won't generate path which contains extension
                // as user might be requesting file
                if (string.IsNullOrEmpty(Path.GetExtension(url)) == false)
                {
                    return 404;
                }

                // only admin can generate
                if (this.CurrentUser.HasClaim("admin") == false)
                {
                    return 404;
                }

                requestedContent = ContentModule.CreateContent(this.SiteDatabase, url);
            }

            // set the typeName to content if not set
            if (requestedContent.typeName == null)
            {
                requestedContent.typeName = "content";
            }

            if (string.IsNullOrEmpty((string)requestedContent.RequiredClaims) == false)
            {
                var required = ((string)requestedContent.RequiredClaims).Split(',');
                var user = this.Context.CurrentUser as NcbUser;
                if (required.Any(c => user.HasClaim(c)) == false)
                {
                    // user does not have any required claims
                    if (this.Context.CurrentUser == NcbUser.Anonymous)
                    {
                        return 401;
                    }

                    return 403;
                }
            }

            if (requestedContent.Layout == null)
            {
                requestedContent.Layout = "Content";
            }

            this.GenerateLayoutPage(this.CurrentSite, requestedContent);

            ContentModule.MapContent(this.Context, requestedContent);

            return View[(string)requestedContent.Layout, new StandardModel( this, requestedContent )];
        }

        #region All Logic Related to Content

        /// <summary>
        /// Get child content of given url
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public static IEnumerable<dynamic> GetChildContents(NancyBlackDatabase db, string url)
        {
            if (url.StartsWith("/") == false)
            {
                url = "/" + url;
            }

            return db.QueryAsDynamic("Content", string.Format("startswith(Url,'{0}/')", url.ToLowerInvariant()), "DisplayOrder");
        }

        /// <summary>
        /// Get Root Content
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public static IEnumerable<dynamic> GetRootContents(NancyBlackDatabase db)
        {
            return db.QueryAsDynamic("Content", "startswith(Url,'/') and ( indexof(substring(Url, 1),'/') lt 0 )", "DisplayOrder");
        }


        /// <summary>
        /// Get child content of given url
        /// </summary>
        /// <param name="url"></param>
        /// <returns></returns>
        public static dynamic GetContent(NancyBlackDatabase db, string url)
        {
            if (url.StartsWith("/") == false)
            {
                url = "/" + url;
            }

            return db.QueryAsDynamic("Content", string.Format("Url eq '{0}'", url.ToLowerInvariant())).FirstOrDefault();
        }

        /// <summary>
        /// Creates a content
        /// </summary>
        /// <param name="url"></param>
        /// <param name="layout"></param>
        /// <returns></returns>
        public static dynamic CreateContent(NancyBlackDatabase db, string url, string layout = "", string requiredClaims = "", int displayOrder = 0)
        {
            if (url.StartsWith("/") == false)
            {
                url = "/" + url;
            }

            // try to find matching view that has same name as url
            var layoutFile = Path.Combine(_RootPath, "Site", "Views", url.Substring(1).Replace('/', '\\') + ".cshtml");
            if (File.Exists(layoutFile))
            {
                layout = url.Substring(1);
            }

            if (layout == "")
            {
                layout = "content";
            }

            // if URL is "/" generate home instead
            if (url == "/")
            {
                layout = "home";
            }

            if (url.StartsWith("/") == false)
            {
                url = "/" + url;
            }

            var createdContent = db.UpsertRecord("Content", new DefaultContent()
            {
                Id = 0,
                Title = Path.GetFileName(url),
                Url = url.ToLowerInvariant(),
                Layout = layout,
                RequiredClaims = requiredClaims,
                DisplayOrder = displayOrder
            });

            return createdContent;
        }
        
        #endregion
    }

}